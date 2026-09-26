from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.platform_admin.infrastructure import service
from poslite.shared.application.clock import Clock
from poslite.shared.domain.errors import DomainError
from poslite.shared.presentation.dependencies import clock, system_sessions
from poslite.shared.presentation.envelope import ApiResponse, ok
from poslite.shared.presentation.schemas import Email

router = APIRouter(prefix="/platform", tags=["platform"])
System = Annotated[async_sessionmaker[AsyncSession], Depends(system_sessions)]
_bearer = HTTPBearer(auto_error=False)


async def current_admin(
    system: System, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]
) -> str:
    """Operator tokens live in platform_tokens only; tenant tokens never resolve here."""
    admin_id = credentials and await service.resolve_admin(system, credentials.credentials)
    if not admin_id:
        raise DomainError(
            "UNAUTHENTICATED", "Invalid or expired operator token", kind="unauthorized"
        )
    return admin_id


Admin = Annotated[str, Depends(current_admin)]


class LoginIn(BaseModel):
    email: Email
    password: str


class LoginOut(BaseModel):
    token: str
    expires_at: datetime


class TenantOut(BaseModel):
    id: str
    slug: str
    name: str
    status: str
    created_at: datetime
    suspended_at: datetime | None
    outlet_count: int
    device_count: int


@router.post("/auth/login")
async def login(
    body: LoginIn, system: System, now: Annotated[Clock, Depends(clock)]
) -> ApiResponse[LoginOut]:
    token, expires_at = await service.login(
        system, email=body.email, password=body.password, now=now.now()
    )
    return ok(LoginOut(token=token, expires_at=expires_at))


@router.get("/tenants")
async def tenants(
    system: System,
    _: Admin,
    status: Annotated[Literal["active", "suspended"] | None, Query()] = None,
) -> ApiResponse[list[TenantOut]]:
    return ok(
        [
            TenantOut.model_validate(t, from_attributes=True)
            for t in await service.list_tenants(system, status)
        ]
    )


@router.post("/tenants/{tenant_id}/suspend")
async def suspend(tenant_id: str, system: System, _: Admin) -> ApiResponse[None]:
    """Back-office writes stop; devices keep pushing sales (05 "Multi-tenancy")."""
    await service.set_tenant_status(system, tenant_id, "suspended")
    return ok(None)


@router.post("/tenants/{tenant_id}/activate")
async def activate(tenant_id: str, system: System, _: Admin) -> ApiResponse[None]:
    await service.set_tenant_status(system, tenant_id, "active")
    return ok(None)
