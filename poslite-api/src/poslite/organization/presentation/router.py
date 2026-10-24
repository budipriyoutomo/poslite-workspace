from collections.abc import Callable
from datetime import time
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.catalog import api as catalog
from poslite.identity import api as identity
from poslite.organization.domain.discount_policy import DiscountPolicy
from poslite.organization.infrastructure.service import (
    BrandInfo,
    DeviceInfo,
    DiningTable,
    OutletInfo,
    OutletSettings,
    add_table,
    create_brand,
    create_outlet,
    delete_brand,
    delete_table,
    device_outlet_id,
    get_brand,
    get_device,
    get_outlet,
    get_outlet_settings,
    list_brands,
    list_devices,
    list_outlets,
    list_tables,
    outlet_code_taken,
    register_device,
    revoke_device,
    table_outlet_id,
    update_brand,
    update_outlet_settings,
    update_table,
)
from poslite.organization.presentation.schemas import (
    AccessBrand,
    AccessOutlet,
    AccessTenant,
    AccessTree,
    ActivateRequest,
    ActivationResult,
    BrandIn,
    BrandOut,
    DeviceListItem,
    DeviceMe,
    DeviceOut,
    DiscountPolicyIn,
    NewOutletIn,
    OutletOut,
    OutletSettingsIn,
    OutletSettingsOut,
    TableIn,
    TableOut,
)
from poslite.payment import api as payment
from poslite.shared.application.clock import Clock
from poslite.shared.domain.errors import DomainError
from poslite.shared.domain.media import media_url
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork
from poslite.shared.presentation import rate_limit
from poslite.shared.presentation.dependencies import (
    clock,
    id_factory,
    media_base_url,
    open_uow,
    system_sessions,
)
from poslite.shared.presentation.envelope import ApiResponse, ok
from poslite.shared.presentation.schemas import Ulid
from poslite.shared.presentation.security import Principal, require_ability
from poslite.tenancy import api as tenancy

router = APIRouter(tags=["organization"])
Reader = Annotated[Principal, Depends(require_ability("backoffice:read"))]
Writer = Annotated[Principal, Depends(require_ability("backoffice:write"))]


def _outlet_out(o: OutletInfo) -> OutletOut:
    return OutletOut(id=o.id, brand_id=o.brand_id, code=o.code, name=o.name, timezone=o.timezone)


async def _outlet_in_scope(
    uow: SqlAlchemyUnitOfWork,
    scope: identity.AccessScope,
    outlet_id: str,
    active_brand: str | None,
) -> OutletInfo:
    outlet = await get_outlet(uow, outlet_id)
    identity.ensure_outlet(
        scope, outlet_id=outlet.id, brand_id=outlet.brand_id, active_brand=active_brand
    )
    return outlet


@router.get("/me/access")
async def my_access(
    request: Request, principal: Reader, scope: identity.Access
) -> ApiResponse[AccessTree]:
    """The brands and outlets this user may pick in the back-office (ADR-022)."""
    async with open_uow(request, principal.tenant_id) as uow:
        tenant = await tenancy.get_tenant(uow)
        brands = await list_brands(uow)
        outlets = await list_outlets(uow)
    tree: list[AccessBrand] = []
    for brand in brands:
        reachable = [
            AccessOutlet(id=o.id, code=o.code, name=o.name, role=role)
            for o in outlets
            if o.brand_id == brand.id
            and (role := scope.outlet_role(outlet_id=o.id, brand_id=o.brand_id)) is not None
        ]
        role = scope.brand_role(brand.id)
        if role is not None or reachable:
            tree.append(
                AccessBrand(
                    id=brand.id, code=brand.code, name=brand.name, role=role, outlets=reachable
                )
            )
    return ok(
        AccessTree(
            tenant=AccessTenant(id=tenant.id, name=tenant.name, status=tenant.status),
            company_scope=scope.company,
            brands=tree,
        )
    )


def _device_out(d: DeviceInfo) -> DeviceOut:
    return DeviceOut(
        id=d.id,
        code=d.code,
        name=d.name,
        outlet=_outlet_out(d.outlet),
    )


def _settings_out(s: OutletSettings) -> OutletSettingsOut:
    return OutletSettingsOut(
        id=s.id,
        code=s.code,
        name=s.name,
        timezone=s.timezone,
        business_day_cutoff=s.business_day_cutoff.strftime("%H:%M"),
        tax_rate_bps=s.tax_rate_bps,
        service_rate_bps=s.service_rate_bps,
        receipt_header=s.receipt_header,
        receipt_footer=s.receipt_footer,
    )


@router.get("/outlets")
async def outlets(
    request: Request,
    principal: Reader,
    scope: identity.Access,
    brand_id: Annotated[Ulid | None, Query()] = None,
) -> ApiResponse[list[OutletOut]]:
    """Outlets in the user's scope, optionally of one brand."""
    async with open_uow(request, principal.tenant_id) as uow:
        rows = await list_outlets(uow)
    return ok(
        [
            _outlet_out(o)
            for o in rows
            if scope.can_access_outlet(outlet_id=o.id, brand_id=o.brand_id)
            and brand_id in (None, o.brand_id)
        ]
    )


@router.post("/devices/activate", status_code=status.HTTP_201_CREATED)
async def activate(
    body: ActivateRequest,
    request: Request,
    system: Annotated[async_sessionmaker[AsyncSession], Depends(system_sessions)],
    now: Annotated[Clock, Depends(clock)],
    new_id: Annotated[Callable[[], str], Depends(id_factory)],
) -> ApiResponse[ActivationResult]:
    """A manager signs a tablet in to an outlet once; the device then works with its own token."""
    await rate_limit.enforce(
        request,
        (rate_limit.ACTIVATE_IP, rate_limit.client_address(request)),
        (rate_limit.ACTIVATE_EMAIL, rate_limit.email_subject(body.email)),
    )
    manager = await identity.authenticate(system, body.email, body.password)
    async with open_uow(request, manager.tenant_id) as uow:
        outlet = await get_outlet(uow, body.outlet_id)
        if not identity.can_activate_devices(
            await identity.role_at(
                uow, user_id=manager.user_id, outlet_id=outlet.id, brand_id=outlet.brand_id
            )
        ):
            raise DomainError(
                "ROLE_NOT_ALLOWED",
                "Only an owner or manager can activate devices",
                kind="forbidden",
            )
        device = await register_device(
            uow,
            device_id=new_id(),
            outlet=outlet,
            name=body.device_name,
            platform=body.platform,
            activated_by=manager.user_id,
        )
        token = await identity.issue_token(
            uow,
            token_id=new_id(),
            owner_type="device",
            owner_id=device.id,
            abilities=identity.DEVICE_ABILITIES,
            expires_at=None,
        )
        await uow.commit()
    return ok(ActivationResult(device=_device_out(device), token=token, server_time=now.now()))


@router.get("/devices/me")
async def me(
    request: Request, principal: Annotated[Principal, Depends(require_ability("device:read"))]
) -> ApiResponse[DeviceMe]:
    async with open_uow(request, principal.tenant_id) as uow:
        device = await get_device(uow, principal.owner_id)
    return ok(DeviceMe(device=_device_out(device)))


@router.get("/outlets/{outlet_id}")
async def settings(
    outlet_id: str,
    request: Request,
    principal: Reader,
    scope: identity.Access,
    brand: identity.BrandHeader = None,
) -> ApiResponse[OutletSettingsOut]:
    async with open_uow(request, principal.tenant_id) as uow:
        await _outlet_in_scope(uow, scope, outlet_id, brand)
        return ok(_settings_out(await get_outlet_settings(uow, outlet_id)))


@router.put("/outlets/{outlet_id}")
async def update_settings(
    outlet_id: str,
    body: OutletSettingsIn,
    request: Request,
    principal: Writer,
    scope: identity.Access,
    brand: identity.BrandHeader = None,
) -> ApiResponse[OutletSettingsOut]:
    hour, minute = map(int, body.business_day_cutoff.split(":"))
    async with open_uow(request, principal.tenant_id) as uow:
        await _outlet_in_scope(uow, scope, outlet_id, brand)
        saved = await update_outlet_settings(
            uow,
            outlet_id,
            name=body.name,
            timezone=body.timezone,
            business_day_cutoff=time(hour, minute),
            tax_rate_bps=body.tax_rate_bps,
            service_rate_bps=body.service_rate_bps,
            receipt_header=body.receipt_header,
            receipt_footer=body.receipt_footer,
        )
        await uow.commit()
    return ok(_settings_out(saved))


@router.post("/outlets", status_code=status.HTTP_201_CREATED)
async def add_outlet(
    body: NewOutletIn,
    request: Request,
    principal: Writer,
    scope: identity.Access,
    new_id: Annotated[Callable[[], str], Depends(id_factory)],
) -> ApiResponse[OutletOut]:
    async with open_uow(request, principal.tenant_id) as uow:
        if not scope.can_manage_brand(body.brand_id):
            raise DomainError("BRAND_FORBIDDEN", "You cannot change this brand", kind="forbidden")
        await get_brand(uow, body.brand_id)
        if await outlet_code_taken(uow, body.code):
            raise DomainError("OUTLET_CODE_TAKEN", "Outlet code is already used", kind="conflict")
        outlet = await create_outlet(
            uow,
            outlet_id=new_id(),
            brand_id=body.brand_id,
            code=body.code,
            name=body.name,
            timezone=body.timezone,
        )
        await payment.enable_all_methods(uow, outlet.id)
        await uow.commit()
    return ok(_outlet_out(outlet))


@router.get("/outlets/{outlet_id}/devices")
async def devices(
    outlet_id: str,
    request: Request,
    principal: Reader,
    scope: identity.Access,
    brand: identity.BrandHeader = None,
) -> ApiResponse[list[DeviceListItem]]:
    async with open_uow(request, principal.tenant_id) as uow:
        await _outlet_in_scope(uow, scope, outlet_id, brand)
        rows = await list_devices(uow, outlet_id)
    return ok([DeviceListItem.model_validate(d, from_attributes=True) for d in rows])


@router.delete("/devices/{device_id}")
async def revoke(
    device_id: str,
    request: Request,
    principal: Writer,
    scope: identity.Access,
    brand: identity.BrandHeader = None,
) -> ApiResponse[None]:
    """Lost or stolen tablet: its token stops working at once (opaque tokens, 05 "Auth")."""
    async with open_uow(request, principal.tenant_id) as uow:
        await _outlet_in_scope(uow, scope, await device_outlet_id(uow, device_id), brand)
        await revoke_device(uow, device_id)
        await identity.revoke_tokens_of(uow, owner_type="device", owner_id=device_id)
        await uow.commit()
    return ok(None)


def _table_out(t: DiningTable) -> TableOut:
    return TableOut(id=t.id, label=t.label, area=t.area, seats=t.seats, sort_order=t.sort_order)


@router.get("/outlets/{outlet_id}/tables")
async def tables(
    outlet_id: str,
    request: Request,
    principal: Reader,
    scope: identity.Access,
    brand: identity.BrandHeader = None,
) -> ApiResponse[list[TableOut]]:
    async with open_uow(request, principal.tenant_id) as uow:
        await _outlet_in_scope(uow, scope, outlet_id, brand)
        return ok([_table_out(t) for t in await list_tables(uow, outlet_id)])


@router.post("/outlets/{outlet_id}/tables", status_code=status.HTTP_201_CREATED)
async def add_dining_table(
    outlet_id: str,
    body: TableIn,
    request: Request,
    principal: Writer,
    scope: identity.Access,
    new_id: Annotated[Callable[[], str], Depends(id_factory)],
    brand: identity.BrandHeader = None,
) -> ApiResponse[TableOut]:
    """Tables are outlet master data; devices get them on their next pull (ADR-015)."""
    async with open_uow(request, principal.tenant_id) as uow:
        await _outlet_in_scope(uow, scope, outlet_id, brand)
        table = await add_table(uow, table_id=new_id(), outlet_id=outlet_id, **body.model_dump())
        await uow.commit()
    return ok(_table_out(table))


@router.put("/tables/{table_id}")
async def update_dining_table(
    table_id: str,
    body: TableIn,
    request: Request,
    principal: Writer,
    scope: identity.Access,
    brand: identity.BrandHeader = None,
) -> ApiResponse[TableOut]:
    async with open_uow(request, principal.tenant_id) as uow:
        await _outlet_in_scope(uow, scope, await table_outlet_id(uow, table_id), brand)
        table = await update_table(uow, table_id, **body.model_dump())
        await uow.commit()
    return ok(_table_out(table))


@router.delete("/tables/{table_id}")
async def delete_dining_table(
    table_id: str,
    request: Request,
    principal: Writer,
    scope: identity.Access,
    brand: identity.BrandHeader = None,
) -> ApiResponse[None]:
    async with open_uow(request, principal.tenant_id) as uow:
        await _outlet_in_scope(uow, scope, await table_outlet_id(uow, table_id), brand)
        await delete_table(uow, table_id)
        await uow.commit()
    return ok(None)


# ── Brands (company page, ADR-022) ─────────────────────────────────────────────────────────

MediaBase = Annotated[str, Depends(media_base_url)]


def _policy(body: BrandIn) -> DiscountPolicy:
    d = body.discount
    return DiscountPolicy(
        tuple(d.percentages),
        tuple(d.amounts),
        d.allow_custom,
        d.cashier_max_percentage,
        d.cashier_max_amount,
    )


def _brand_out(b: BrandInfo, base_url: str) -> BrandOut:
    return BrandOut(
        id=b.id,
        code=b.code,
        name=b.name,
        logo_key=b.logo_key,
        logo_url=media_url(base_url, b.logo_key),
        receipt_header=b.receipt_header,
        receipt_footer=b.receipt_footer,
        is_active=b.is_active,
        discount=DiscountPolicyIn.model_validate(b.discount.as_data()),
        price_includes_tax=b.price_includes_tax,
    )


@router.get("/brands", dependencies=[identity.company_only])
async def brands(
    request: Request, principal: Reader, base_url: MediaBase
) -> ApiResponse[list[BrandOut]]:
    async with open_uow(request, principal.tenant_id) as uow:
        return ok([_brand_out(b, base_url) for b in await list_brands(uow)])


@router.post("/brands", status_code=status.HTTP_201_CREATED, dependencies=[identity.company_only])
async def add_brand(
    body: BrandIn,
    request: Request,
    principal: Writer,
    new_id: Annotated[Callable[[], str], Depends(id_factory)],
    base_url: MediaBase,
) -> ApiResponse[BrandOut]:
    async with open_uow(request, principal.tenant_id) as uow:
        brand_id = await create_brand(
            uow,
            brand_id=new_id(),
            **body.model_dump(exclude={"discount"}),
            discount=_policy(body),
        )
        await catalog.seed_channels(uow, new_id, brand_id=brand_id)
        brand = await get_brand(uow, brand_id)
        await uow.commit()
    return ok(_brand_out(brand, base_url))


@router.put("/brands/{brand_id}", dependencies=[identity.company_only])
async def edit_brand(
    brand_id: str, body: BrandIn, request: Request, principal: Writer, base_url: MediaBase
) -> ApiResponse[BrandOut]:
    async with open_uow(request, principal.tenant_id) as uow:
        brand = await update_brand(
            uow, brand_id, **body.model_dump(exclude={"discount"}), discount=_policy(body)
        )
        await uow.commit()
    return ok(_brand_out(brand, base_url))


@router.delete("/brands/{brand_id}", dependencies=[identity.company_only])
async def remove_brand(brand_id: str, request: Request, principal: Writer) -> ApiResponse[None]:
    """Only a brand without live outlets: its orders and reports keep pointing at it."""
    async with open_uow(request, principal.tenant_id) as uow:
        await delete_brand(uow, brand_id)
        await uow.commit()
    return ok(None)
