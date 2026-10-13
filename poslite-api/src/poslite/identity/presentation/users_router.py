from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.identity.application.schemas import (
    AssignmentIn,
    AssignmentOut,
    AssignmentsIn,
    OutletRole,
    PinIn,
    UserIn,
    UserOut,
    UserUpdate,
)
from poslite.identity.domain.assignments import (
    Assignment,
    check_assignment,
    from_outlet_roles,
    outlet_roles,
)
from poslite.identity.infrastructure.models import UserModel
from poslite.identity.infrastructure.passwords import hash_password
from poslite.identity.infrastructure.service import (
    add_assignments,
    assignments_of,
    create_user,
    delete_user,
    email_taken,
    get_user,
    list_users,
    replace_assignments,
    set_pin,
    update_user,
)
from poslite.identity.infrastructure.tokens import revoke_tokens_of
from poslite.identity.presentation.access import company_only
from poslite.organization import api as organization
from poslite.shared.domain.errors import DomainError
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork
from poslite.shared.presentation.dependencies import id_factory, open_uow, system_sessions
from poslite.shared.presentation.envelope import ApiResponse, ok
from poslite.shared.presentation.security import Principal, require_ability

# Company page (ADR-022): company-wide users only.
router = APIRouter(tags=["users"], dependencies=[company_only])
Writer = Annotated[Principal, Depends(require_ability("backoffice:write"))]

# The older per-outlet `outlets` (before ADR-022) still works: company and brand assignments
# are listed at every outlet they cover; an owner row anywhere = company owner.


async def _assignments(uow: SqlAlchemyUnitOfWork, roles: list[OutletRole]) -> list[Assignment]:
    outlets = [await organization.get_outlet(uow, r.outlet_id) for r in roles]
    return from_outlet_roles(
        [(o.id, o.brand_id, r.role) for o, r in zip(outlets, roles, strict=True)]
    )


def _user_out(
    user: UserModel, assignments: list[Assignment], outlets: list[tuple[str, str]]
) -> UserOut:
    return UserOut(
        id=user.id,
        name=user.name,
        email=user.email,
        has_pin=user.pin_hash is not None,
        is_active=user.is_active,
        assignments=[_assignment_out(a) for a in assignments],
        outlets=[OutletRole(outlet_id=o, role=r) for o, r in outlet_roles(assignments, outlets)],
    )


async def _outlet_brands(uow: SqlAlchemyUnitOfWork) -> list[tuple[str, str]]:
    return [(o.id, o.brand_id) for o in await organization.list_outlets(uow)]


@router.get("/users")
async def users(
    request: Request, principal: Annotated[Principal, Depends(require_ability("backoffice:read"))]
) -> ApiResponse[list[UserOut]]:
    async with open_uow(request, principal.tenant_id) as uow:
        outlets = await _outlet_brands(uow)
        return ok([_user_out(u, a, outlets) for u, a in await list_users(uow)])


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
        if body.assignments:
            rows = [await _resolve(uow, r) for r in body.assignments]
            for row in rows:
                check_assignment(row)
        else:
            rows = await _assignments(uow, body.outlets)
        await add_assignments(uow, user_id=user_id, assignments=rows)
        if body.pin:
            await set_pin(uow, user_id=user_id, pin=body.pin)
        user = await get_user(uow, user_id)
        result = _user_out(user, await assignments_of(uow, user_id), await _outlet_brands(uow))
        await uow.commit()
    return ok(result)


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
        await update_user(
            uow,
            user_id=user_id,
            name=body.name,
            is_active=body.is_active,
            assignments=None if body.outlets is None else await _assignments(uow, body.outlets),
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


async def _resolve(uow: SqlAlchemyUnitOfWork, row: AssignmentIn) -> Assignment:
    """Fill an outlet scope's brand from the outlet; referenced brand and outlet must exist."""
    brand_id = row.brand_id
    if row.outlet_id is not None:
        outlet = await organization.get_outlet(uow, row.outlet_id)
        if brand_id not in (None, outlet.brand_id):
            raise DomainError("CROSS_BRAND_REFERENCE", "The outlet belongs to another brand")
        brand_id = outlet.brand_id
    elif brand_id is not None:
        await organization.get_brand(uow, brand_id)
    return Assignment(
        role=row.role, scope_type=row.scope_type, brand_id=brand_id, outlet_id=row.outlet_id
    )


def _assignment_out(a: Assignment) -> AssignmentOut:
    return AssignmentOut(
        role=a.role, scope_type=a.scope_type, brand_id=a.brand_id, outlet_id=a.outlet_id
    )


@router.get("/users/{user_id}/assignments")
async def assignments(
    user_id: str,
    request: Request,
    principal: Annotated[Principal, Depends(require_ability("backoffice:read"))],
) -> ApiResponse[list[AssignmentOut]]:
    async with open_uow(request, principal.tenant_id) as uow:
        return ok([_assignment_out(a) for a in await assignments_of(uow, user_id)])


@router.put("/users/{user_id}/assignments")
async def set_assignments(
    user_id: str, body: AssignmentsIn, request: Request, principal: Writer
) -> ApiResponse[list[AssignmentOut]]:
    """Replace every role of a user (ADR-022); the company keeps at least one owner."""
    async with open_uow(request, principal.tenant_id) as uow:
        rows = [await _resolve(uow, r) for r in body.assignments]
        await replace_assignments(uow, user_id=user_id, assignments=rows)
        result = [_assignment_out(a) for a in await assignments_of(uow, user_id)]
        await uow.commit()
    return ok(result)
