from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status

from poslite.identity.application.schemas import OutletRole, PinIn, UserIn, UserOut
from poslite.identity.infrastructure.passwords import hash_password
from poslite.identity.infrastructure.service import assign_role, create_user, list_users, set_pin
from poslite.organization import api as organization
from poslite.shared.presentation.dependencies import id_factory, open_uow
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
) -> ApiResponse[UserOut]:
    """Cashiers get only a PIN (no email/password): they never hold an API token."""
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
