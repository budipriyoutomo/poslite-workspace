"""Operator accounts and tenant status — everything here runs as poslite_system
(05-backend-architecture.md: the system role is allowed for /platform/* only)."""

import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import func, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.identity import api as identity
from poslite.platform_admin.infrastructure.models import PlatformAdminModel, PlatformTokenModel
from poslite.shared.domain.errors import DomainError
from poslite.shared.domain.ids import new_ulid

TOKEN_TTL = timedelta(hours=8)


@dataclass(frozen=True, slots=True)
class Operator:
    id: str
    email: str
    name: str
    created_at: datetime
    disabled_at: datetime | None


def _operator(admin: PlatformAdminModel) -> Operator:
    return Operator(admin.id, admin.email, admin.name, admin.created_at, admin.disabled_at)


async def create_admin(
    system: async_sessionmaker[AsyncSession], *, email: str, name: str, password: str
) -> str:
    admin_id = new_ulid()
    password_hash = await identity.hash_password(password)
    try:
        async with system() as session, session.begin():
            session.add(
                PlatformAdminModel(
                    id=admin_id, email=email.lower(), name=name, password_hash=password_hash
                )
            )
    except IntegrityError as error:  # uq_platform_admins_email (lower(email))
        raise DomainError(
            "OPERATOR_EMAIL_TAKEN", "Another operator uses this email", kind="conflict"
        ) from error
    return admin_id


async def login(
    system: async_sessionmaker[AsyncSession], *, email: str, password: str, now: datetime
) -> tuple[str, datetime]:
    async with system() as session, session.begin():
        admin = await session.scalar(
            select(PlatformAdminModel).where(
                func.lower(PlatformAdminModel.email) == email.lower(),
                PlatformAdminModel.disabled_at.is_(None),
            )
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
            select(PlatformTokenModel.admin_id)
            .join(PlatformAdminModel, PlatformAdminModel.id == PlatformTokenModel.admin_id)
            .where(
                PlatformTokenModel.token_hash == identity.hash_token(token),
                PlatformTokenModel.revoked_at.is_(None),
                PlatformTokenModel.expires_at > func.now(),
                PlatformAdminModel.disabled_at.is_(None),
            )
        )


async def get_admin(system: async_sessionmaker[AsyncSession], admin_id: str) -> Operator:
    async with system() as session:
        admin = await session.get(PlatformAdminModel, admin_id)
    if admin is None:
        raise DomainError("OPERATOR_NOT_FOUND", "Operator not found", kind="not_found")
    return _operator(admin)


async def list_admins(system: async_sessionmaker[AsyncSession]) -> list[Operator]:
    async with system() as session:
        admins = await session.scalars(
            select(PlatformAdminModel).order_by(PlatformAdminModel.created_at)
        )
        return [_operator(a) for a in admins]


async def set_admin_disabled(
    system: async_sessionmaker[AsyncSession], *, actor_id: str, admin_id: str, disabled: bool
) -> Operator:
    """Disabling signs the operator out everywhere; nobody can lock themselves out."""
    if disabled and admin_id == actor_id:
        raise DomainError(
            "CANNOT_DISABLE_SELF", "You cannot disable your own account", kind="conflict"
        )
    async with system() as session, session.begin():
        admin = await session.get(PlatformAdminModel, admin_id, with_for_update=True)
        if admin is None:
            raise DomainError("OPERATOR_NOT_FOUND", "Operator not found", kind="not_found")
        admin.disabled_at = func.now() if disabled else None
        if disabled:
            await session.execute(
                update(PlatformTokenModel)
                .where(
                    PlatformTokenModel.admin_id == admin_id,
                    PlatformTokenModel.revoked_at.is_(None),
                )
                .values(revoked_at=func.now())
            )
        await session.flush()
        await session.refresh(admin)
        return _operator(admin)


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
