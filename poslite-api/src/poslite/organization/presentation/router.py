from collections.abc import Callable
from datetime import time
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.identity import api as identity
from poslite.organization.infrastructure.service import (
    DeviceInfo,
    DiningTable,
    OutletSettings,
    add_table,
    create_outlet,
    delete_table,
    get_device,
    get_outlet,
    get_outlet_settings,
    list_devices,
    list_outlets,
    list_tables,
    outlet_code_taken,
    register_device,
    revoke_device,
    update_outlet_settings,
    update_table,
)
from poslite.organization.presentation.schemas import (
    ActivateRequest,
    ActivationResult,
    DeviceListItem,
    DeviceMe,
    DeviceOut,
    NewOutletIn,
    OutletOut,
    OutletSettingsIn,
    OutletSettingsOut,
    TableIn,
    TableOut,
)
from poslite.shared.application.clock import Clock
from poslite.shared.domain.errors import DomainError
from poslite.shared.presentation.dependencies import clock, id_factory, open_uow, system_sessions
from poslite.shared.presentation.envelope import ApiResponse, ok
from poslite.shared.presentation.security import Principal, require_ability

router = APIRouter(tags=["organization"])


def _device_out(d: DeviceInfo) -> DeviceOut:
    return DeviceOut(
        id=d.id,
        code=d.code,
        name=d.name,
        outlet=OutletOut(
            id=d.outlet.id, code=d.outlet.code, name=d.outlet.name, timezone=d.outlet.timezone
        ),
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
    request: Request, principal: Annotated[Principal, Depends(require_ability("backoffice:read"))]
) -> ApiResponse[list[OutletOut]]:
    async with open_uow(request, principal.tenant_id) as uow:
        rows = await list_outlets(uow)
    return ok([OutletOut(id=o.id, code=o.code, name=o.name, timezone=o.timezone) for o in rows])


@router.post("/devices/activate", status_code=status.HTTP_201_CREATED)
async def activate(
    body: ActivateRequest,
    request: Request,
    system: Annotated[async_sessionmaker[AsyncSession], Depends(system_sessions)],
    now: Annotated[Clock, Depends(clock)],
    new_id: Annotated[Callable[[], str], Depends(id_factory)],
) -> ApiResponse[ActivationResult]:
    """A manager signs a tablet in to an outlet once; the device then works with its own token."""
    manager = await identity.authenticate(system, body.email, body.password)
    async with open_uow(request, manager.tenant_id) as uow:
        outlet = await get_outlet(uow, body.outlet_id)
        if not identity.can_activate_devices(
            await identity.role_at(uow, user_id=manager.user_id, outlet_id=outlet.id)
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
    principal: Annotated[Principal, Depends(require_ability("backoffice:read"))],
) -> ApiResponse[OutletSettingsOut]:
    async with open_uow(request, principal.tenant_id) as uow:
        return ok(_settings_out(await get_outlet_settings(uow, outlet_id)))


@router.put("/outlets/{outlet_id}")
async def update_settings(
    outlet_id: str,
    body: OutletSettingsIn,
    request: Request,
    principal: Annotated[Principal, Depends(require_ability("backoffice:write"))],
) -> ApiResponse[OutletSettingsOut]:
    hour, minute = map(int, body.business_day_cutoff.split(":"))
    async with open_uow(request, principal.tenant_id) as uow:
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
    principal: Annotated[Principal, Depends(require_ability("backoffice:write"))],
    new_id: Annotated[Callable[[], str], Depends(id_factory)],
) -> ApiResponse[OutletOut]:
    async with open_uow(request, principal.tenant_id) as uow:
        if await outlet_code_taken(uow, body.code):
            raise DomainError("OUTLET_CODE_TAKEN", "Outlet code is already used", kind="conflict")
        outlet = await create_outlet(
            uow, outlet_id=new_id(), code=body.code, name=body.name, timezone=body.timezone
        )
        await uow.commit()
    return ok(OutletOut(id=outlet.id, code=outlet.code, name=outlet.name, timezone=outlet.timezone))


@router.get("/outlets/{outlet_id}/devices")
async def devices(
    outlet_id: str,
    request: Request,
    principal: Annotated[Principal, Depends(require_ability("backoffice:read"))],
) -> ApiResponse[list[DeviceListItem]]:
    async with open_uow(request, principal.tenant_id) as uow:
        await get_outlet(uow, outlet_id)
        rows = await list_devices(uow, outlet_id)
    return ok([DeviceListItem.model_validate(d, from_attributes=True) for d in rows])


@router.delete("/devices/{device_id}")
async def revoke(
    device_id: str,
    request: Request,
    principal: Annotated[Principal, Depends(require_ability("backoffice:write"))],
) -> ApiResponse[None]:
    """Lost or stolen tablet: its token stops working at once (opaque tokens, 05 "Auth")."""
    async with open_uow(request, principal.tenant_id) as uow:
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
    principal: Annotated[Principal, Depends(require_ability("backoffice:read"))],
) -> ApiResponse[list[TableOut]]:
    async with open_uow(request, principal.tenant_id) as uow:
        return ok([_table_out(t) for t in await list_tables(uow, outlet_id)])


@router.post("/outlets/{outlet_id}/tables", status_code=status.HTTP_201_CREATED)
async def add_dining_table(
    outlet_id: str,
    body: TableIn,
    request: Request,
    principal: Annotated[Principal, Depends(require_ability("backoffice:write"))],
    new_id: Annotated[Callable[[], str], Depends(id_factory)],
) -> ApiResponse[TableOut]:
    """Tables are outlet master data; devices get them on their next pull (ADR-015)."""
    async with open_uow(request, principal.tenant_id) as uow:
        table = await add_table(uow, table_id=new_id(), outlet_id=outlet_id, **body.model_dump())
        await uow.commit()
    return ok(_table_out(table))


@router.put("/tables/{table_id}")
async def update_dining_table(
    table_id: str,
    body: TableIn,
    request: Request,
    principal: Annotated[Principal, Depends(require_ability("backoffice:write"))],
) -> ApiResponse[TableOut]:
    async with open_uow(request, principal.tenant_id) as uow:
        table = await update_table(uow, table_id, **body.model_dump())
        await uow.commit()
    return ok(_table_out(table))


@router.delete("/tables/{table_id}")
async def delete_dining_table(
    table_id: str,
    request: Request,
    principal: Annotated[Principal, Depends(require_ability("backoffice:write"))],
) -> ApiResponse[None]:
    async with open_uow(request, principal.tenant_id) as uow:
        await delete_table(uow, table_id)
        await uow.commit()
    return ok(None)
