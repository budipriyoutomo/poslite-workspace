"""Operator accounts and cross-tenant tenant management — everything here runs as poslite_system
(05-backend-architecture.md: the system role is allowed for /platform/* only)."""

import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.identity import api as identity
from poslite.platform_admin.infrastructure.models import PlatformAdminModel, PlatformTokenModel
from poslite.shared.domain.errors import DomainError
from poslite.shared.domain.ids import new_ulid

TOKEN_TTL = timedelta(hours=8)


async def create_admin(
    system: async_sessionmaker[AsyncSession], *, email: str, name: str, password: str
) -> str:
    admin_id = new_ulid()
    password_hash = await identity.hash_password(password)
    async with system() as session, session.begin():
        session.add(
            PlatformAdminModel(
                id=admin_id, email=email.lower(), name=name, password_hash=password_hash
            )
        )
    return admin_id


async def login(
    system: async_sessionmaker[AsyncSession], *, email: str, password: str, now: datetime
) -> tuple[str, datetime]:
    async with system() as session, session.begin():
        admin = await session.scalar(
            select(PlatformAdminModel).where(func.lower(PlatformAdminModel.email) == email.lower())
        )
        if admin is None or not await identity.verify_password(admin.password_hash, password):
            raise DomainError(
                "INVALID_CREDENTIALS", "Email or password is wrong", kind="unauthorized"
            )
        token, expires_at = secrets.token_urlsafe(32), now + TOKEN_TTL
        session.add(
            PlatformTokenModel(
                id=new_ulid(),
                admin_id=admin.id,
                token_hash=identity.hash_token(token),
                expires_at=expires_at,
            )
        )
    return token, expires_at


async def resolve_admin(system: async_sessionmaker[AsyncSession], token: str) -> str | None:
    async with system() as session:
        return await session.scalar(
            select(PlatformTokenModel.admin_id).where(
                PlatformTokenModel.token_hash == identity.hash_token(token),
                PlatformTokenModel.revoked_at.is_(None),
                PlatformTokenModel.expires_at > func.now(),
            )
        )


@dataclass(frozen=True, slots=True)
class TenantRow:
    id: str
    slug: str
    name: str
    status: str
    created_at: datetime
    suspended_at: datetime | None
    outlet_count: int
    device_count: int


async def list_tenants(
    system: async_sessionmaker[AsyncSession], status: str | None
) -> list[TenantRow]:
    query = """
        SELECT t.id, t.slug, t.name, t.status, t.created_at, t.suspended_at,
               (SELECT count(*) FROM outlets o
                 WHERE o.tenant_id = t.id AND o.deleted_at IS NULL) AS outlet_count,
               (SELECT count(*) FROM devices d
                 WHERE d.tenant_id = t.id AND d.revoked_at IS NULL) AS device_count
        FROM tenants t
        WHERE (CAST(:status AS text) IS NULL OR t.status = :status)
        ORDER BY t.created_at DESC
    """
    async with system() as session:
        rows = await session.execute(text(query), {"status": status})
        return [TenantRow(*r) for r in rows]


async def set_tenant_status(
    system: async_sessionmaker[AsyncSession], tenant_id: str, status: str
) -> None:
    async with system() as session, session.begin():
        result = await session.execute(
            text(
                "UPDATE tenants SET status = :status,"
                " suspended_at = CASE WHEN :suspend THEN now() ELSE NULL END,"
                " suspended_reason = CASE WHEN :suspend THEN 'manual' ELSE NULL END"
                " WHERE id = :id"
            ),
            {"status": status, "suspend": status == "suspended", "id": tenant_id},
        )
        if result.rowcount == 0:  # type: ignore[attr-defined]  # CursorResult of an UPDATE
            raise DomainError("TENANT_NOT_FOUND", "Tenant not found", kind="not_found")
