from dataclasses import dataclass
from datetime import datetime, time

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from poslite.organization.domain.device_code import device_code
from poslite.organization.infrastructure.models import DeviceModel, DiningTableModel, OutletModel
from poslite.shared.application.ports import OutletProfile
from poslite.shared.application.sync import Change
from poslite.shared.domain.errors import DomainError
from poslite.shared.infrastructure.sync_feed import feed
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork


@dataclass(frozen=True, slots=True)
class OutletInfo:
    id: str
    code: str
    name: str
    timezone: str


@dataclass(frozen=True, slots=True)
class DeviceInfo:
    id: str
    code: str
    name: str
    outlet: OutletInfo


def _outlet(o: OutletModel) -> OutletInfo:
    return OutletInfo(id=o.id, code=o.code, name=o.name, timezone=o.timezone)


async def create_outlet(
    uow: SqlAlchemyUnitOfWork, *, outlet_id: str, code: str, name: str, timezone: str
) -> OutletInfo:
    outlet = OutletModel(
        id=outlet_id, tenant_id=uow.tenant_id, code=code, name=name, timezone=timezone
    )
    uow.session.add(outlet)
    await uow.session.flush()
    return _outlet(outlet)


async def list_outlets(uow: SqlAlchemyUnitOfWork) -> list[OutletInfo]:
    rows = await uow.session.scalars(
        select(OutletModel).where(OutletModel.deleted_at.is_(None)).order_by(OutletModel.code)
    )
    return [_outlet(o) for o in rows]


async def get_outlet(uow: SqlAlchemyUnitOfWork, outlet_id: str) -> OutletInfo:
    """RLS hides other tenants' outlets, so a foreign id is simply not found."""
    outlet = await uow.session.get(OutletModel, outlet_id)
    if outlet is None or outlet.deleted_at is not None:
        raise DomainError("OUTLET_NOT_FOUND", "Outlet not found", kind="not_found")
    return _outlet(outlet)


async def register_device(
    uow: SqlAlchemyUnitOfWork,
    *,
    device_id: str,
    outlet: OutletInfo,
    name: str,
    platform: str,
    activated_by: str,
) -> DeviceInfo:
    # Serialize code assignment per outlet so two activations never get the same letter.
    await uow.session.execute(select(func.pg_advisory_xact_lock(func.hashtext(outlet.id))))
    existing = await uow.session.scalar(
        select(func.count()).select_from(DeviceModel).where(DeviceModel.outlet_id == outlet.id)
    )
    device = DeviceModel(
        id=device_id,
        tenant_id=uow.tenant_id,
        outlet_id=outlet.id,
        code=device_code(existing or 0),
        name=name,
        platform=platform,
        activated_by=activated_by,
    )
    uow.session.add(device)
    await uow.session.flush()
    return DeviceInfo(id=device.id, code=device.code, name=device.name, outlet=outlet)


async def get_device(uow: SqlAlchemyUnitOfWork, device_id: str) -> DeviceInfo:
    device = await uow.session.get(DeviceModel, device_id)
    if device is None or device.revoked_at is not None:
        raise DomainError("DEVICE_REVOKED", "Device is revoked", kind="unauthorized")
    outlet = await get_outlet(uow, device.outlet_id)
    return DeviceInfo(id=device.id, code=device.code, name=device.name, outlet=outlet)


@dataclass(frozen=True, slots=True)
class OutletSettings:
    id: str
    code: str
    name: str
    timezone: str
    business_day_cutoff: time
    tax_rate_bps: int
    service_rate_bps: int
    receipt_header: str
    receipt_footer: str


async def update_outlet_settings(
    uow: SqlAlchemyUnitOfWork,
    outlet_id: str,
    *,
    name: str,
    timezone: str,
    business_day_cutoff: time,
    tax_rate_bps: int,
    service_rate_bps: int,
    receipt_header: str,
    receipt_footer: str,
) -> OutletSettings:
    """New rates apply to new orders; devices keep the snapshot they sold with (ADR-011)."""
    outlet = await uow.session.get(OutletModel, outlet_id)
    if outlet is None or outlet.deleted_at is not None:
        raise DomainError("OUTLET_NOT_FOUND", "Outlet not found", kind="not_found")
    outlet.name, outlet.timezone, outlet.business_day_cutoff = name, timezone, business_day_cutoff
    outlet.tax_rate_bps, outlet.service_rate_bps = tax_rate_bps, service_rate_bps
    outlet.receipt_header, outlet.receipt_footer = receipt_header, receipt_footer
    await uow.session.flush()
    return _settings(outlet)


async def get_outlet_settings(uow: SqlAlchemyUnitOfWork, outlet_id: str) -> OutletSettings:
    outlet = await uow.session.get(OutletModel, outlet_id)
    if outlet is None or outlet.deleted_at is not None:
        raise DomainError("OUTLET_NOT_FOUND", "Outlet not found", kind="not_found")
    return _settings(outlet)


def _settings(outlet: OutletModel) -> OutletSettings:
    return OutletSettings(
        id=outlet.id,
        code=outlet.code,
        name=outlet.name,
        timezone=outlet.timezone,
        business_day_cutoff=outlet.business_day_cutoff,
        tax_rate_bps=outlet.tax_rate_bps,
        service_rate_bps=outlet.service_rate_bps,
        receipt_header=outlet.receipt_header,
        receipt_footer=outlet.receipt_footer,
    )


async def outlet_changes(
    uow: SqlAlchemyUnitOfWork, *, outlet_id: str, cursor: int, limit: int
) -> list[Change]:
    """The device outlet profile: rates, receipt text, business day (entity outlet_setting)."""
    return await feed(
        uow,
        OutletModel,
        "outlet_setting",
        cursor=cursor,
        limit=limit,
        where=OutletModel.id == outlet_id,
        data=lambda o: {
            "code": o.code,
            "name": o.name,
            "timezone": o.timezone,
            "business_day_cutoff": o.business_day_cutoff.strftime("%H:%M"),
            "tax_rate_bps": o.tax_rate_bps,
            "service_rate_bps": o.service_rate_bps,
            "receipt_header": o.receipt_header,
            "receipt_footer": o.receipt_footer,
        },
    )


async def outlet_profile(uow: SqlAlchemyUnitOfWork, outlet_id: str) -> OutletProfile:
    """Current rates and business-day settings (sales/shift use this, not the table)."""
    outlet = await uow.session.get(OutletModel, outlet_id)
    if outlet is None:
        raise DomainError("OUTLET_NOT_FOUND", "Outlet not found", kind="not_found")
    return OutletProfile(
        service_bps=outlet.service_rate_bps,
        tax_bps=outlet.tax_rate_bps,
        timezone=outlet.timezone,
        business_day_cutoff=outlet.business_day_cutoff,
    )


async def outlet_code_taken(uow: SqlAlchemyUnitOfWork, code: str) -> bool:
    return (
        await uow.session.scalar(select(OutletModel.id).where(OutletModel.code == code))
    ) is not None


@dataclass(frozen=True, slots=True)
class DeviceRow:
    id: str
    code: str
    name: str
    platform: str
    app_version: str | None
    last_seen_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime


async def list_devices(uow: SqlAlchemyUnitOfWork, outlet_id: str) -> list[DeviceRow]:
    rows = await uow.session.scalars(
        select(DeviceModel).where(DeviceModel.outlet_id == outlet_id).order_by(DeviceModel.code)
    )
    return [
        DeviceRow(
            d.id,
            d.code,
            d.name,
            d.platform,
            d.app_version,
            d.last_seen_at,
            d.revoked_at,
            d.created_at,
        )
        for d in rows
    ]


async def revoke_device(uow: SqlAlchemyUnitOfWork, device_id: str) -> None:
    device = await uow.session.get(DeviceModel, device_id)
    if device is None:
        raise DomainError("DEVICE_NOT_FOUND", "Device not found", kind="not_found")
    if device.revoked_at is None:
        device.revoked_at = func.now()
    await uow.session.flush()


async def touch_device(uow: SqlAlchemyUnitOfWork, device_id: str, app_version: str | None) -> None:
    """Last seen + app version, shown in device management (05 "Middleware")."""
    values: dict[str, object] = {"last_seen_at": func.now()}
    if app_version:
        values["app_version"] = app_version[:30]
    await uow.session.execute(
        update(DeviceModel).where(DeviceModel.id == device_id).values(**values)
    )


@dataclass(frozen=True, slots=True)
class DiningTable:
    id: str
    label: str
    area: str
    seats: int
    sort_order: int


def _table(t: DiningTableModel) -> DiningTable:
    return DiningTable(id=t.id, label=t.label, area=t.area, seats=t.seats, sort_order=t.sort_order)


async def _live_table(uow: SqlAlchemyUnitOfWork, table_id: str) -> DiningTableModel:
    row = await uow.session.get(DiningTableModel, table_id)
    if row is None or row.deleted_at is not None:
        raise DomainError("TABLE_NOT_FOUND", "Table not found", kind="not_found")
    return row


async def _ensure_label_free(
    uow: SqlAlchemyUnitOfWork, outlet_id: str, label: str, *, except_id: str | None = None
) -> None:
    query = select(DiningTableModel.id).where(
        DiningTableModel.outlet_id == outlet_id,
        func.lower(DiningTableModel.label) == label.lower(),
        DiningTableModel.deleted_at.is_(None),
    )
    if except_id is not None:
        query = query.where(DiningTableModel.id != except_id)
    if await uow.session.scalar(query) is not None:
        raise DomainError("TABLE_LABEL_TAKEN", "Table label is already used", kind="conflict")


async def list_tables(uow: SqlAlchemyUnitOfWork, outlet_id: str) -> list[DiningTable]:
    await get_outlet(uow, outlet_id)
    rows = await uow.session.scalars(
        select(DiningTableModel)
        .where(DiningTableModel.outlet_id == outlet_id, DiningTableModel.deleted_at.is_(None))
        .order_by(DiningTableModel.sort_order, DiningTableModel.label)
    )
    return [_table(t) for t in rows]


async def add_table(
    uow: SqlAlchemyUnitOfWork,
    *,
    table_id: str,
    outlet_id: str,
    label: str,
    area: str,
    seats: int,
    sort_order: int,
) -> DiningTable:
    await get_outlet(uow, outlet_id)
    await _ensure_label_free(uow, outlet_id, label)
    row = DiningTableModel(
        id=table_id,
        tenant_id=uow.tenant_id,
        outlet_id=outlet_id,
        label=label,
        area=area,
        seats=seats,
        sort_order=sort_order,
    )
    uow.session.add(row)
    await uow.session.flush()
    return _table(row)


async def update_table(
    uow: SqlAlchemyUnitOfWork, table_id: str, *, label: str, area: str, seats: int, sort_order: int
) -> DiningTable:
    row = await _live_table(uow, table_id)
    await _ensure_label_free(uow, row.outlet_id, label, except_id=row.id)
    row.label, row.area, row.seats, row.sort_order = label, area, seats, sort_order
    await uow.session.flush()
    return _table(row)


async def delete_table(uow: SqlAlchemyUnitOfWork, table_id: str) -> None:
    row = await _live_table(uow, table_id)
    row.deleted_at = func.now()
    await uow.session.flush()


async def dining_table_changes(
    uow: SqlAlchemyUnitOfWork, *, outlet_id: str, cursor: int, limit: int
) -> list[Change]:
    return await feed(
        uow,
        DiningTableModel,
        "dining_table",
        cursor=cursor,
        limit=limit,
        where=DiningTableModel.outlet_id == outlet_id,
        data=lambda t: {
            "label": t.label,
            "area": t.area,
            "seats": t.seats,
            "sort_order": t.sort_order,
        },
    )


async def active_outlet_count(session: AsyncSession, tenant_id: str) -> int:
    """Outlets billed this period (ADR-018); explicit tenant filter for poslite_system."""
    count = await session.scalar(
        select(func.count())
        .select_from(OutletModel)
        .where(OutletModel.tenant_id == tenant_id, OutletModel.deleted_at.is_(None))
    )
    return int(count or 0)
