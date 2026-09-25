from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.identity import api as identity
from poslite.organization import api as organization
from poslite.shared.application.clock import Clock
from poslite.shared.domain.errors import DomainError
from poslite.shared.presentation.dependencies import clock, id_factory, open_uow, system_sessions
from poslite.shared.presentation.envelope import ApiResponse, ok
from poslite.tenancy.infrastructure.service import create_tenant, slug_taken
from poslite.tenancy.presentation.schemas import SignupRequest

router = APIRouter(tags=["tenancy"])


@router.post("/tenants/signup", status_code=status.HTTP_201_CREATED)
async def signup(
    body: SignupRequest,
    request: Request,
    system: Annotated[async_sessionmaker[AsyncSession], Depends(system_sessions)],
    now: Annotated[Clock, Depends(clock)],
    new_id: Annotated[Callable[[], str], Depends(id_factory)],
) -> ApiResponse[identity.AuthResult]:
    """New SaaS customer: tenant, owner and first outlet in one transaction, plus a token."""
    if await slug_taken(system, body.slug):
        raise DomainError("SLUG_TAKEN", "Business slug is already used", kind="conflict")
    if await identity.email_taken(system, body.email):
        raise DomainError("EMAIL_TAKEN", "Email is already registered", kind="conflict")

    owner_id = new_id()
    async with open_uow(request, new_id()) as uow:
        tenant = await create_tenant(
            uow, slug=body.slug, name=body.business_name, timezone=body.outlet.timezone
        )
        await identity.create_user(
            uow,
            user_id=owner_id,
            name=body.owner_name,
            email=body.email,
            password_hash=await identity.hash_password(body.password),
        )
        outlet = await organization.create_outlet(
            uow,
            outlet_id=new_id(),
            code=body.outlet.code,
            name=body.outlet.name,
            timezone=body.outlet.timezone,
        )
        await identity.assign_role(uow, user_id=owner_id, outlet_id=outlet.id, role="owner")
        result = await identity.start_backoffice_session(
            uow,
            user_id=owner_id,
            name=body.owner_name,
            tenant=identity.TenantOut(
                id=tenant.id, slug=tenant.slug, name=tenant.name, status=tenant.status
            ),
            token_id=new_id(),
            clock=now,
        )
        await uow.commit()
    return ok(result)
