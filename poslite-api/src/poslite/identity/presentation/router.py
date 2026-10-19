from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.identity.infrastructure.service import authenticate
from poslite.identity.infrastructure.tokens import revoke_token
from poslite.identity.presentation.schemas import AuthResult, LoginRequest, TenantOut
from poslite.identity.presentation.session import start_backoffice_session
from poslite.shared.application.clock import Clock
from poslite.shared.presentation import rate_limit
from poslite.shared.presentation.dependencies import clock, id_factory, open_uow, system_sessions
from poslite.shared.presentation.envelope import ApiResponse, ok
from poslite.shared.presentation.security import Principal, require_ability
from poslite.tenancy.api import get_tenant

router = APIRouter(tags=["auth"])


@router.post("/auth/login")
async def login(
    body: LoginRequest,
    request: Request,
    system: Annotated[async_sessionmaker[AsyncSession], Depends(system_sessions)],
    now: Annotated[Clock, Depends(clock)],
    new_id: Annotated[Callable[[], str], Depends(id_factory)],
) -> ApiResponse[AuthResult]:
    await rate_limit.enforce(
        request,
        (rate_limit.LOGIN_IP, rate_limit.client_address(request)),
        (rate_limit.LOGIN_EMAIL, rate_limit.email_subject(body.email)),
    )
    user = await authenticate(system, body.email, body.password)
    async with open_uow(request, user.tenant_id) as uow:
        tenant = await get_tenant(uow)
        result = await start_backoffice_session(
            uow,
            user_id=user.user_id,
            name=user.name,
            tenant=TenantOut(
                id=tenant.id, slug=tenant.slug, name=tenant.name, status=tenant.status
            ),
            token_id=new_id(),
            clock=now,
        )
        await uow.commit()
    return ok(result)


@router.post("/auth/logout")
async def logout(
    request: Request, principal: Annotated[Principal, Depends(require_ability("backoffice:*"))]
) -> ApiResponse[None]:
    async with open_uow(request, principal.tenant_id) as uow:
        await revoke_token(uow, principal.token_id)
        await uow.commit()
    return ok(None)
