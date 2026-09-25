from dataclasses import dataclass
from datetime import time

from sqlalchemy import func, select

from poslite.organization.domain.device_code import device_code
from poslite.organization.infrastructure.models import DeviceModel, OutletModel
from poslite.shared.domain.errors import DomainError
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
