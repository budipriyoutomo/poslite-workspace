from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.identity.application.schemas import OutletRole, PinIn, UserIn, UserOut, UserUpdate
from poslite.identity.infrastructure.passwords import hash_password
from poslite.identity.infrastructure.service import (
    assign_role,
    create_user,
    delete_user,
    email_taken,
    list_users,
    set_pin,
    update_user,
)
from poslite.identity.infrastructure.tokens import revoke_tokens_of
from poslite.organization import api as organization
from poslite.shared.domain.errors import DomainError
from poslite.shared.presentation.dependencies import id_factory, open_uow, system_sessions
from poslite.shared.presentation.envelope import ApiResponse, ok
from poslite.shared.presentation.security import Principal, require_ability

router = APIRouter(tags=["users"])
Writer = Annotated[Principal, Depends(require_ability("backoffice:write"))]


@router.get("/users")
async def users(
    request: Request, principal: Annotated[Principal, Depends(require_ability("backoffice:read"))]
) -> ApiResponse[list[UserOut]]:
    async with open_uow(request, principal.tenant_id) as uow:
        return ok(
            [
                UserOut(
                    id=u.id,
                    name=u.name,
                    email=u.email,
                    has_pin=u.pin_hash is not None,
                    is_active=u.is_active,
                    outlets=[OutletRole(outlet_id=o, role=r) for o, r in roles.items()],
                )
                for u, roles in await list_users(uow)
            ]
        )


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def create(
    body: UserIn,
    request: Request,
    principal: Writer,
    new_id: Annotated[Callable[[], str], Depends(id_factory)],
    system: Annotated[async_sessionmaker[AsyncSession], Depends(system_sessions)],
) -> ApiResponse[UserOut]:
    """Cashiers get only a PIN (no email/password): they never hold an API token."""
    # Emails are unique across tenants (they are the login), so the check needs BYPASSRLS.
    if body.email and await email_taken(system, body.email):
        raise DomainError("EMAIL_TAKEN", "Email is already registered", kind="conflict")
    user_id = new_id()
    async with open_uow(request, principal.tenant_id) as uow:
        password_hash = await hash_password(body.password) if body.password else None
        await create_user(
            uow, user_id=user_id, name=body.name, email=body.email, password_hash=password_hash
        )
        for assignment in body.outlets:
            await organization.get_outlet(uow, assignment.outlet_id)
            await assign_role(
                uow, user_id=user_id, outlet_id=assignment.outlet_id, role=assignment.role
            )
        if body.pin:
            await set_pin(uow, user_id=user_id, pin=body.pin)
        await uow.commit()
    return ok(
        UserOut(
            id=user_id,
            name=body.name,
            email=body.email,
            has_pin=body.pin is not None,
            is_active=True,
            outlets=body.outlets,
        )
    )


@router.put("/users/{user_id}/pin")
async def change_pin(
    user_id: str, body: PinIn, request: Request, principal: Writer
) -> ApiResponse[None]:
    async with open_uow(request, principal.tenant_id) as uow:
        await set_pin(uow, user_id=user_id, pin=body.pin)
        await uow.commit()
    return ok(None)


@router.put("/users/{user_id}")
async def update(
    user_id: str, body: UserUpdate, request: Request, principal: Writer
) -> ApiResponse[None]:
    async with open_uow(request, principal.tenant_id) as uow:
        for assignment in body.outlets:
            await organization.get_outlet(uow, assignment.outlet_id)
        await update_user(
            uow,
            user_id=user_id,
            name=body.name,
            is_active=body.is_active,
            outlets=[(o.outlet_id, o.role) for o in body.outlets],
        )
        if not body.is_active:
            await revoke_tokens_of(uow, owner_type="user", owner_id=user_id)
        await uow.commit()
    return ok(None)


@router.delete("/users/{user_id}")
async def remove(user_id: str, request: Request, principal: Writer) -> ApiResponse[None]:
    async with open_uow(request, principal.tenant_id) as uow:
        await delete_user(uow, user_id=user_id, actor_id=principal.owner_id)
        await revoke_tokens_of(uow, owner_type="user", owner_id=user_id)
        await uow.commit()
    return ok(None)
