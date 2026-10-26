"""Shared open bills of a table-service outlet (ADR-031). The server never prices a bill: it keeps
the device's lines, a version per save, and the lease of the device editing it."""

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import exists, or_, select, update
from sqlalchemy.exc import IntegrityError

from poslite.sales.domain.open_bills import Lease, check_save, take_lease
from poslite.sales.infrastructure.models import OpenBillModel
from poslite.shared.domain.errors import DomainError
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork

Json = dict[str, Any]  # the device's JSON, stored as sent


@dataclass(frozen=True, slots=True)
class BillDraft:
    """What a device saves: the table, the cart, the guests and when the bill was printed."""

    table_id: str | None
    table_label: str
    lines: list[Json]
    discount: Json | None
    guest_count: int | None = None
    printed_at: datetime | None = None


@dataclass(frozen=True, slots=True)
class OpenBill:
    id: str
    table_id: str | None
    table_label: str
    lines: list[Json]
    discount: Json | None
    guest_count: int | None
    printed_at: datetime | None
    opened_by: str
    opened_at: datetime
    version: int
    lease: Lease | None
    updated_at: datetime


def _lease(m: OpenBillModel) -> Lease | None:
    if m.lease_device_id is None or m.lease_user_id is None or m.lease_until is None:
        return None
    return Lease(m.lease_device_id, m.lease_user_id, m.lease_until)


def _bill(m: OpenBillModel) -> OpenBill:
    return OpenBill(
        id=m.id,
        table_id=m.table_id,
        table_label=m.table_label,
        lines=m.lines,
        discount=m.discount,
        guest_count=m.guest_count,
        printed_at=m.printed_at,
        opened_by=m.opened_by,
        opened_at=m.opened_at,
        version=m.version,
        lease=_lease(m),
        updated_at=m.updated_at,
    )


def _not_found() -> DomainError:
    return DomainError("BILL_NOT_FOUND", "Open bill not found", kind="not_found")


def _occupied() -> DomainError:
    return DomainError("TABLE_OCCUPIED", "The table already has an open bill", kind="conflict")


async def _open_row(uow: SqlAlchemyUnitOfWork, bill_id: str, outlet_id: str) -> OpenBillModel:
    row = await uow.session.get(OpenBillModel, bill_id, populate_existing=True)
    if row is None or row.outlet_id != outlet_id or row.closed_at is not None:
        raise _not_found()
    return row


async def list_open_bills(uow: SqlAlchemyUnitOfWork, *, outlet_id: str) -> list[OpenBill]:
    rows = await uow.session.scalars(
        select(OpenBillModel)
        .where(OpenBillModel.outlet_id == outlet_id, OpenBillModel.closed_at.is_(None))
        .order_by(OpenBillModel.opened_at, OpenBillModel.id)
    )
    return [_bill(r) for r in rows]


async def has_open_bills(uow: SqlAlchemyUnitOfWork, outlet_id: str) -> bool:
    found = await uow.session.scalar(
        select(
            exists().where(OpenBillModel.outlet_id == outlet_id, OpenBillModel.closed_at.is_(None))
        )
    )
    return bool(found)


async def open_bill(
    uow: SqlAlchemyUnitOfWork,
    *,
    bill_id: str,
    outlet_id: str,
    draft: BillDraft,
    opened_by: str,
    opened_at: datetime,
    device_id: str,
    user_id: str,
    now: datetime,
    release: bool = False,
) -> OpenBill:
    """The device that opens a bill holds its lease, unless it `release`s it with the save.
    Opening the same id again (a retry) returns the bill as it is."""
    existing = await uow.session.get(OpenBillModel, bill_id)
    if existing is not None:
        if existing.outlet_id != outlet_id:
            raise _not_found()
        return _bill(existing)
    lease = None if release else take_lease(None, device_id=device_id, user_id=user_id, now=now)
    row = OpenBillModel(
        id=bill_id,
        tenant_id=uow.tenant_id,
        outlet_id=outlet_id,
        table_id=draft.table_id,
        table_label=draft.table_label,
        lines=draft.lines,
        discount=draft.discount,
        guest_count=draft.guest_count,
        printed_at=draft.printed_at,
        opened_by=opened_by,
        opened_at=opened_at,
        version=1,
        lease_device_id=lease and lease.device_id,
        lease_user_id=lease and lease.user_id,
        lease_until=lease and lease.until,
        updated_at=now,
    )
    uow.session.add(row)
    try:
        async with uow.session.begin_nested():
            await uow.session.flush()
    except IntegrityError as err:
        raise _occupied() from err
    return _bill(row)


async def lease_bill(
    uow: SqlAlchemyUnitOfWork,
    bill_id: str,
    *,
    outlet_id: str,
    device_id: str,
    user_id: str,
    now: datetime,
) -> OpenBill:
    """Takes the bill for editing, or renews this device's lease while the bill is on screen."""
    row = await _open_row(uow, bill_id, outlet_id)
    lease = take_lease(_lease(row), device_id=device_id, user_id=user_id, now=now)
    taken = await uow.session.scalar(
        update(OpenBillModel)
        .where(
            OpenBillModel.id == bill_id,
            OpenBillModel.closed_at.is_(None),
            # Re-checked under the row lock: another device may have taken it since the read.
            or_(
                OpenBillModel.lease_device_id.is_(None),
                OpenBillModel.lease_device_id == device_id,
                OpenBillModel.lease_until <= now,
            ),
        )
        .values(lease_device_id=device_id, lease_user_id=user_id, lease_until=lease.until)
        .returning(OpenBillModel)
        .execution_options(populate_existing=True)
    )
    if taken is None:
        raise DomainError("BILL_LEASED", "Another device is editing this bill", kind="conflict")
    return _bill(taken)


async def release_lease(
    uow: SqlAlchemyUnitOfWork, bill_id: str, *, outlet_id: str, device_id: str
) -> None:
    """The bill left the device's screen; a lease of another device is left alone."""
    await _open_row(uow, bill_id, outlet_id)
    await uow.session.execute(
        update(OpenBillModel)
        .where(OpenBillModel.id == bill_id, OpenBillModel.lease_device_id == device_id)
        .values(lease_device_id=None, lease_user_id=None, lease_until=None)
    )


async def save_bill(
    uow: SqlAlchemyUnitOfWork,
    bill_id: str,
    *,
    outlet_id: str,
    version: int,
    draft: BillDraft,
    device_id: str,
    user_id: str,
    now: datetime,
    release: bool = False,
) -> OpenBill:
    """Replaces the bill when `version` is still the server's, and renews the device's lease (or
    frees the bill with `release`). Of two saves of one version, the row lock lets exactly one
    through."""
    row = await _open_row(uow, bill_id, outlet_id)
    check_save(
        version=row.version, sent_version=version, lease=_lease(row), device_id=device_id, now=now
    )
    lease = None if release else take_lease(None, device_id=device_id, user_id=user_id, now=now)
    try:
        async with uow.session.begin_nested():
            saved = await uow.session.scalar(
                update(OpenBillModel)
                .where(
                    OpenBillModel.id == bill_id,
                    OpenBillModel.version == version,
                    OpenBillModel.closed_at.is_(None),
                )
                .values(
                    table_id=draft.table_id,
                    table_label=draft.table_label,
                    lines=draft.lines,
                    discount=draft.discount,
                    guest_count=draft.guest_count,
                    printed_at=draft.printed_at,
                    version=OpenBillModel.version + 1,
                    lease_device_id=lease and lease.device_id,
                    lease_user_id=lease and lease.user_id,
                    lease_until=lease and lease.until,
                    updated_at=now,
                )
                .returning(OpenBillModel)
                .execution_options(populate_existing=True)
            )
    except IntegrityError as err:
        raise _occupied() from err
    if saved is None:
        raise DomainError(
            "BILL_VERSION_CONFLICT", "The bill changed on another device", kind="conflict"
        )
    return _bill(saved)


async def cancel_bill(
    uow: SqlAlchemyUnitOfWork,
    bill_id: str,
    *,
    outlet_id: str,
    version: int,
    device_id: str,
    now: datetime,
) -> None:
    """Nothing was paid. Items the kitchen had are voided by the device (bill.item_voided)."""
    row = await _open_row(uow, bill_id, outlet_id)
    check_save(
        version=row.version, sent_version=version, lease=_lease(row), device_id=device_id, now=now
    )
    closed = await uow.session.scalar(
        update(OpenBillModel)
        .where(OpenBillModel.id == bill_id, OpenBillModel.version == version)
        .values(closed_at=now, lease_device_id=None, lease_user_id=None, lease_until=None)
        .returning(OpenBillModel.id)
    )
    if closed is None:
        raise DomainError(
            "BILL_VERSION_CONFLICT", "The bill changed on another device", kind="conflict"
        )


class SqlAlchemyOpenBills:
    """Closes a bill when its payment arrives (order.placed with closes_bill_id)."""

    def __init__(self, uow: SqlAlchemyUnitOfWork) -> None:
        self._uow = uow

    async def close(self, bill_id: str, *, outlet_id: str, order_id: str, at: datetime) -> None:
        # A bill this server never had (opened and paid offline) has nothing to close.
        await self._uow.session.execute(
            update(OpenBillModel)
            .where(
                OpenBillModel.id == bill_id,
                OpenBillModel.outlet_id == outlet_id,
                OpenBillModel.closed_at.is_(None),
            )
            .values(
                closed_at=at,
                closed_by_order_id=order_id,
                lease_device_id=None,
                lease_user_id=None,
                lease_until=None,
            )
        )
