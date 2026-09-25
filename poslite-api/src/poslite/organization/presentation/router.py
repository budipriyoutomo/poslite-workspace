from collections.abc import Callable
from datetime import time
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.identity import api as identity
from poslite.organization.infrastructure.service import (
    DeviceInfo,
    get_device,
    get_outlet,
    list_outlets,
    register_device,
    update_outlet_settings,
)
from poslite.organization.presentation.schemas import (
    ActivateRequest,
    ActivationResult,
    DeviceMe,
    DeviceOut,
    OutletOut,
    OutletSettingsIn,
    OutletSettingsOut,
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
        outlet=OutletOut(id=d.outlet.id, code=d.outlet.code, name=d.outlet.name),
    )


@router.get("/outlets")
async def outlets(
    request: Request, principal: Annotated[Principal, Depends(require_ability("backoffice:read"))]
) -> ApiResponse[list[OutletOut]]:
    async with open_uow(request, principal.tenant_id) as uow:
        rows = await list_outlets(uow)
    return ok([OutletOut(id=o.id, code=o.code, name=o.name) for o in rows])


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
    return ok(
        OutletSettingsOut(
            id=saved.id,
            code=saved.code,
            name=saved.name,
            timezone=saved.timezone,
            business_day_cutoff=saved.business_day_cutoff.strftime("%H:%M"),
            tax_rate_bps=saved.tax_rate_bps,
            service_rate_bps=saved.service_rate_bps,
            receipt_header=saved.receipt_header,
            receipt_footer=saved.receipt_footer,
        )
    )
