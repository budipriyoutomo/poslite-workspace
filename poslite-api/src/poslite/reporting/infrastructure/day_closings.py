"""Day closing (ADR-026): one outlet's business-day snapshot, compared with live numbers later."""

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from poslite.identity import api as identity
from poslite.organization import api as organization
from poslite.reporting.domain.day_closing import (
    CashSummary,
    DeviceSeen,
    ShiftCash,
    day_warnings,
    ensure_can_close,
)
from poslite.reporting.infrastructure.models import DayClosingModel
from poslite.reporting.infrastructure.queries import sales_summary
from poslite.shared.domain.business_date import business_day_end
from poslite.shared.domain.errors import DomainError
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork
from poslite.shift import api as shift

# What a late sync can change; warnings describe the moment of closing, not the numbers.
_COMPARED = ("totals", "payment_methods", "cash")


@dataclass(frozen=True, slots=True)
class DayClosing:
    id: str
    outlet_id: str
    business_date: date
    closed_by: str
    closed_by_name: str
    closed_at: datetime
    notes: str
    snapshot: dict[str, Any]


@dataclass(frozen=True, slots=True)
class DayStatus:
    outlet_id: str
    business_date: date
    day_ended: bool
    current: dict[str, Any]
    closing: DayClosing | None
    changed_since_close: bool


async def _day_end(uow: SqlAlchemyUnitOfWork, outlet_id: str, business_date: date) -> datetime:
    profile = await organization.outlet_profile(uow, outlet_id)
    return business_day_end(business_date, profile.timezone, profile.business_day_cutoff)


async def _snapshot(
    uow: SqlAlchemyUnitOfWork, outlet_id: str, business_date: date, day_end: datetime
) -> dict[str, Any]:
    sales = await sales_summary(uow, [outlet_id], business_date, business_date)
    cash = CashSummary.of(
        ShiftCash(s.status, s.opening_cash, s.expected_cash, s.counted_cash, s.variance)
        for s in await shift.shifts_of_day(uow, outlet_id, business_date)
    )
    devices = [
        DeviceSeen(d.id, d.code, d.name, d.last_seen_at)
        for d in await organization.list_devices(uow, outlet_id)
        if d.revoked_at is None
    ]
    return {
        "totals": sales.totals,
        "payment_methods": sales.payment_methods,
        "cash": cash.as_dict(),
        "warnings": day_warnings(
            open_shift_count=cash.open_shift_count, devices=devices, day_end=day_end
        ),
    }


async def _closings(uow: SqlAlchemyUnitOfWork, rows: list[DayClosingModel]) -> list[DayClosing]:
    names = await identity.user_names(uow, [r.closed_by for r in rows])
    return [
        DayClosing(
            id=r.id,
            outlet_id=r.outlet_id,
            business_date=r.business_date,
            closed_by=r.closed_by,
            closed_by_name=names.get(r.closed_by, "?"),
            closed_at=r.closed_at,
            notes=r.notes,
            snapshot=r.snapshot,
        )
        for r in rows
    ]


async def _find(
    uow: SqlAlchemyUnitOfWork, outlet_id: str, business_date: date
) -> DayClosingModel | None:
    row: DayClosingModel | None = await uow.session.scalar(
        select(DayClosingModel).where(
            DayClosingModel.outlet_id == outlet_id, DayClosingModel.business_date == business_date
        )
    )
    return row


async def day_status(
    uow: SqlAlchemyUnitOfWork, outlet_id: str, business_date: date, *, now: datetime
) -> DayStatus:
    day_end = await _day_end(uow, outlet_id, business_date)
    current = await _snapshot(uow, outlet_id, business_date, day_end)
    row = await _find(uow, outlet_id, business_date)
    closing = (await _closings(uow, [row]))[0] if row else None
    changed = closing is not None and any(closing.snapshot.get(k) != current[k] for k in _COMPARED)
    return DayStatus(outlet_id, business_date, now >= day_end, current, closing, changed)


async def close_day(
    uow: SqlAlchemyUnitOfWork,
    outlet_id: str,
    business_date: date,
    *,
    closed_by: str,
    notes: str,
    now: datetime,
) -> DayClosing:
    """Never blocked by open shifts or unsynced devices: they are kept as warnings (ADR-026)."""
    day_end = await _day_end(uow, outlet_id, business_date)
    existing = await _find(uow, outlet_id, business_date)
    ensure_can_close(now=now, day_end=day_end, closed=existing is not None)
    row = DayClosingModel(
        id=uow.new_id(),
        tenant_id=uow.tenant_id,
        outlet_id=outlet_id,
        business_date=business_date,
        closed_by=closed_by,
        closed_at=now,
        notes=notes,
        snapshot=await _snapshot(uow, outlet_id, business_date, day_end),
    )
    uow.session.add(row)
    try:
        await uow.session.flush()
    except IntegrityError as err:  # closed concurrently by another request
        raise DomainError(
            "DAY_ALREADY_CLOSED", "This business day is already closed", kind="conflict"
        ) from err
    return (await _closings(uow, [row]))[0]


async def list_day_closings(
    uow: SqlAlchemyUnitOfWork, outlet_id: str, start: date, end: date
) -> list[DayClosing]:
    rows = await uow.session.scalars(
        select(DayClosingModel)
        .where(
            DayClosingModel.outlet_id == outlet_id,
            DayClosingModel.business_date.between(start, end),
        )
        .order_by(DayClosingModel.business_date.desc())
    )
    return await _closings(uow, list(rows))
