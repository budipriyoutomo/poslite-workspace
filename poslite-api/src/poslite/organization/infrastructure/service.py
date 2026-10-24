from dataclasses import dataclass, field
from datetime import datetime, time

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from poslite.organization.domain.device_code import device_code
from poslite.organization.domain.discount_policy import DiscountPolicy
from poslite.organization.infrastructure.models import (
    BrandModel,
    DeviceModel,
    DiningTableModel,
    OutletModel,
)
from poslite.shared.application.ports import OutletProfile
from poslite.shared.application.sync import Change
from poslite.shared.domain.errors import DomainError
from poslite.shared.infrastructure.sync_feed import feed
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork


@dataclass(frozen=True, slots=True)
class OutletInfo:
    id: str
    brand_id: str
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
    return OutletInfo(id=o.id, brand_id=o.brand_id, code=o.code, name=o.name, timezone=o.timezone)


@dataclass(frozen=True, slots=True)
class BrandInfo:
    id: str
    code: str
    name: str
    logo_key: str | None = None
    receipt_header: str = ""
    receipt_footer: str = ""
    is_active: bool = True
    discount: DiscountPolicy = field(default_factory=DiscountPolicy)
    price_includes_tax: bool = False


def _policy(b: BrandModel) -> DiscountPolicy:
    return DiscountPolicy(
        percentages=tuple(b.discount_percentages),
        amounts=tuple(b.discount_amounts),
        allow_custom=b.allow_custom_discount,
        cashier_max_percentage=b.cashier_max_discount_percentage,
        cashier_max_amount=b.cashier_max_discount_amount,
    )


def _set_policy(b: BrandModel, policy: DiscountPolicy) -> None:
    b.discount_percentages = sorted(set(policy.percentages))
    b.discount_amounts = sorted(set(policy.amounts))
    b.allow_custom_discount = policy.allow_custom
    b.cashier_max_discount_percentage = policy.cashier_max_percentage
    b.cashier_max_discount_amount = policy.cashier_max_amount


def _brand(b: BrandModel) -> BrandInfo:
    return BrandInfo(
        id=b.id,
        code=b.code,
        name=b.name,
        logo_key=b.logo_key,
        receipt_header=b.receipt_header,
        receipt_footer=b.receipt_footer,
        is_active=b.is_active,
        discount=_policy(b),
        price_includes_tax=b.price_includes_tax,
    )


async def list_brands(uow: SqlAlchemyUnitOfWork) -> list[BrandInfo]:
    rows = await uow.session.scalars(
        select(BrandModel).where(BrandModel.deleted_at.is_(None)).order_by(BrandModel.code)
    )
    return [_brand(b) for b in rows]


async def _live_brand(uow: SqlAlchemyUnitOfWork, brand_id: str) -> BrandModel:
    brand = await uow.session.get(BrandModel, brand_id)
    if brand is None or brand.deleted_at is not None:
        raise DomainError("BRAND_NOT_FOUND", "Brand not found", kind="not_found")
    return brand


async def get_brand(uow: SqlAlchemyUnitOfWork, brand_id: str) -> BrandInfo:
    return _brand(await _live_brand(uow, brand_id))


async def _ensure_code_free(
    uow: SqlAlchemyUnitOfWork, code: str, *, except_id: str | None = None
) -> None:
    query = select(BrandModel.id).where(
        func.lower(BrandModel.code) == code.lower(), BrandModel.deleted_at.is_(None)
    )
    if except_id is not None:
        query = query.where(BrandModel.id != except_id)
    if await uow.session.scalar(query) is not None:
        raise DomainError("BRAND_CODE_TAKEN", "Brand code is already used", kind="conflict")


def _check_logo(uow: SqlAlchemyUnitOfWork, logo_key: str | None) -> None:
    if logo_key is not None and not logo_key.startswith(f"{uow.tenant_id}/"):
        raise DomainError("INVALID_IMAGE_KEY", "Upload the logo with POST /media/images first")


async def create_brand(
    uow: SqlAlchemyUnitOfWork,
    *,
    brand_id: str,
    code: str,
    name: str,
    logo_key: str | None = None,
    receipt_header: str = "",
    receipt_footer: str = "",
    is_active: bool = True,
    discount: DiscountPolicy | None = None,
    price_includes_tax: bool = False,
) -> str:
    await _ensure_code_free(uow, code)
    _check_logo(uow, logo_key)
    brand = BrandModel(
        id=brand_id,
        tenant_id=uow.tenant_id,
        code=code,
        name=name,
        logo_key=logo_key,
        receipt_header=receipt_header,
        receipt_footer=receipt_footer,
        is_active=is_active,
        price_includes_tax=price_includes_tax,
    )
    _set_policy(brand, discount or DiscountPolicy())
    uow.session.add(brand)
    await uow.session.flush()
    return brand_id


async def update_brand(
    uow: SqlAlchemyUnitOfWork,
    brand_id: str,
    *,
    code: str,
    name: str,
    logo_key: str | None,
    receipt_header: str,
    receipt_footer: str,
    is_active: bool,
    discount: DiscountPolicy,
    price_includes_tax: bool = False,
) -> BrandInfo:
    """Devices see brand data inside `outlet_setting`, so every outlet of the brand is
    re-versioned in the same transaction (ADR-009, ADR-022)."""
    brand = await _live_brand(uow, brand_id)
    await _ensure_code_free(uow, code, except_id=brand_id)
    if logo_key != brand.logo_key:
        _check_logo(uow, logo_key)
    brand.code, brand.name, brand.logo_key = code, name, logo_key
    brand.receipt_header, brand.receipt_footer = receipt_header, receipt_footer
    brand.is_active, brand.updated_at = is_active, func.now()
    brand.price_includes_tax = price_includes_tax  # new orders only: old ones keep their mode
    _set_policy(brand, discount)
    await uow.session.execute(
        update(OutletModel).where(OutletModel.brand_id == brand_id).values(updated_at=func.now())
    )
    await uow.session.flush()
    return _brand(brand)


async def delete_brand(uow: SqlAlchemyUnitOfWork, brand_id: str) -> None:
    brand = await _live_brand(uow, brand_id)
    outlets = await uow.session.scalar(
        select(func.count())
        .select_from(OutletModel)
        .where(OutletModel.brand_id == brand_id, OutletModel.deleted_at.is_(None))
    )
    if outlets:
        raise DomainError(
            "BRAND_HAS_OUTLETS", "Move or close the brand's outlets first", kind="conflict"
        )
    brand.deleted_at = func.now()
    await uow.session.flush()


async def create_outlet(
    uow: SqlAlchemyUnitOfWork,
    *,
    outlet_id: str,
    brand_id: str,
    code: str,
    name: str,
    timezone: str,
) -> OutletInfo:
    outlet = OutletModel(
        id=outlet_id,
        tenant_id=uow.tenant_id,
        brand_id=brand_id,
        code=code,
        name=name,
        timezone=timezone,
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


async def brand_of_outlet(uow: SqlAlchemyUnitOfWork, outlet_id: str) -> str:
    """Brand of any outlet, closed ones too: past orders and events keep their brand."""
    brand_id = await uow.session.scalar(
        select(OutletModel.brand_id).where(OutletModel.id == outlet_id)
    )
    if brand_id is None:
        raise DomainError("OUTLET_NOT_FOUND", "Outlet not found", kind="not_found")
    return brand_id


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


async def find_device(uow: SqlAlchemyUnitOfWork, device_id: str) -> DeviceInfo | None:
    """Any device of the company, revoked ones too (their exports can still be imported)."""
    device = await uow.session.get(DeviceModel, device_id)
    if device is None:
        return None
    outlet = await uow.session.get(OutletModel, device.outlet_id)
    if outlet is None:
        return None
    return DeviceInfo(id=device.id, code=device.code, name=device.name, outlet=_outlet(outlet))


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
    service_mode: str
    cash_rounding_unit: int = 0
    cash_rounding_mode: str = "nearest"


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
    service_mode: str,
    cash_rounding_unit: int = 0,
    cash_rounding_mode: str = "nearest",
) -> OutletSettings:
    """New rates apply to new orders; devices keep the snapshot they sold with (ADR-011). A
    device switches service mode once it has no open bill of its own (ADR-031 rule 1)."""
    outlet = await uow.session.get(OutletModel, outlet_id)
    if outlet is None or outlet.deleted_at is not None:
        raise DomainError("OUTLET_NOT_FOUND", "Outlet not found", kind="not_found")
    outlet.name, outlet.timezone, outlet.business_day_cutoff = name, timezone, business_day_cutoff
    outlet.tax_rate_bps, outlet.service_rate_bps = tax_rate_bps, service_rate_bps
    outlet.receipt_header, outlet.receipt_footer = receipt_header, receipt_footer
    outlet.service_mode = service_mode
    outlet.cash_rounding_unit, outlet.cash_rounding_mode = cash_rounding_unit, cash_rounding_mode
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
        service_mode=outlet.service_mode,
        cash_rounding_unit=outlet.cash_rounding_unit,
        cash_rounding_mode=outlet.cash_rounding_mode,
    )


async def outlet_changes(
    uow: SqlAlchemyUnitOfWork, *, outlet_id: str, cursor: int, limit: int
) -> list[Change]:
    """The device outlet profile: rates, receipt text, business day, brand (entity
    outlet_setting). Receipt text left empty at the outlet comes from the brand (ADR-022);
    brand changes re-version the outlet, so this row carries them."""
    brand = await uow.session.scalar(
        select(BrandModel)
        .join(OutletModel, OutletModel.brand_id == BrandModel.id)
        .where(OutletModel.id == outlet_id)
    )
    if brand is None:
        raise DomainError("OUTLET_NOT_FOUND", "Outlet not found", kind="not_found")
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
            "receipt_header": o.receipt_header or brand.receipt_header,
            "receipt_footer": o.receipt_footer or brand.receipt_footer,
            "brand": {
                "id": brand.id,
                "code": brand.code,
                "name": brand.name,
                "logo_key": brand.logo_key,
            },
            "discount_policy": _policy(brand).as_data(),
            "price_includes_tax": brand.price_includes_tax,
            "service_mode": o.service_mode,
            "cash_rounding_unit": o.cash_rounding_unit,
            "cash_rounding_mode": o.cash_rounding_mode,
        },
    )


async def outlet_profile(uow: SqlAlchemyUnitOfWork, outlet_id: str) -> OutletProfile:
    """Current rates and business-day settings (sales/shift use this, not the table)."""
    outlet = await uow.session.get(OutletModel, outlet_id)
    if outlet is None:
        raise DomainError("OUTLET_NOT_FOUND", "Outlet not found", kind="not_found")
    brand = await uow.session.get_one(BrandModel, outlet.brand_id)
    return OutletProfile(
        service_bps=outlet.service_rate_bps,
        tax_bps=outlet.tax_rate_bps,
        timezone=outlet.timezone,
        business_day_cutoff=outlet.business_day_cutoff,
        cashier_max_discount_percentage=brand.cashier_max_discount_percentage,
        cashier_max_discount_amount=brand.cashier_max_discount_amount,
        price_includes_tax=brand.price_includes_tax,
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


async def device_outlet_id(uow: SqlAlchemyUnitOfWork, device_id: str) -> str:
    device = await uow.session.get(DeviceModel, device_id)
    if device is None:
        raise DomainError("DEVICE_NOT_FOUND", "Device not found", kind="not_found")
    return device.outlet_id


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


async def table_outlet_id(uow: SqlAlchemyUnitOfWork, table_id: str) -> str:
    return (await _live_table(uow, table_id)).outlet_id


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
