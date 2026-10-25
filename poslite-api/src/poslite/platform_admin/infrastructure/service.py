"""Operator accounts and tenant status — everything here runs as poslite_system
(05-backend-architecture.md: the system role is allowed for /platform/* only)."""

import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal

from sqlalchemy import delete, func, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.identity import api as identity
from poslite.platform_admin.domain import totp
from poslite.platform_admin.infrastructure.models import (
    PlatformAdminModel,
    PlatformRecoveryCodeModel,
    PlatformTokenModel,
)
from poslite.shared.domain.errors import DomainError
from poslite.shared.domain.ids import new_ulid

TOKEN_TTL = timedelta(hours=8)
CHALLENGE_TTL = timedelta(minutes=5)  # P1-8: time to type the code after the password
RECOVERY_CODES = 10


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


@dataclass(frozen=True, slots=True)
class Challenge:
    """After the password: the second step (P1-8). `secret` only when 2FA is being set up."""

    token: str
    expires_at: datetime
    step: Literal["setup", "verify"]
    secret: str | None
    account: str


@dataclass(frozen=True, slots=True)
class Session:
    token: str
    expires_at: datetime
    recovery_codes: list[str]  # only right after setup, shown once


def _issue(
    session: AsyncSession, admin_id: str, now: datetime, *, stage: str
) -> tuple[str, datetime]:
    token = secrets.token_urlsafe(32)
    expires_at = now + (CHALLENGE_TTL if stage == "challenge" else TOKEN_TTL)
    session.add(
        PlatformTokenModel(
            id=new_ulid(),
            admin_id=admin_id,
            token_hash=identity.hash_token(token),
            expires_at=expires_at,
            stage=stage,
        )
    )
    return token, expires_at


async def login(
    system: async_sessionmaker[AsyncSession], *, email: str, password: str, now: datetime
) -> Challenge:
    """The password opens only the second step. Without 2FA yet, the operator sets it up now
    (P1-8: mandatory at the first sign-in)."""
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
        is_setup = admin.totp_enabled_at is None
        if is_setup:
            admin.totp_secret = totp.new_secret()  # a fresh one for every unfinished setup
        token, expires_at = _issue(session, admin.id, now, stage="challenge")
        return Challenge(
            token,
            expires_at,
            "setup" if is_setup else "verify",
            admin.totp_secret if is_setup else None,
            admin.email,
        )


def _invalid_code() -> DomainError:
    return DomainError("INVALID_2FA_CODE", "The code is wrong or expired", kind="unauthorized")


async def complete_login(
    system: async_sessionmaker[AsyncSession],
    *,
    challenge: str,
    code: str | None,
    recovery_code: str | None,
    now: datetime,
) -> tuple[str, Session]:
    """The second step: a TOTP code, or (once 2FA is on) one unused recovery code. Returns the
    operator id and the console session; the challenge is spent either way it succeeds."""
    async with system() as session, session.begin():
        row = await session.scalar(
            select(PlatformTokenModel).where(
                PlatformTokenModel.token_hash == identity.hash_token(challenge),
                PlatformTokenModel.stage == "challenge",
                PlatformTokenModel.revoked_at.is_(None),
                PlatformTokenModel.expires_at > now,
            )
        )
        if row is None:
            raise _invalid_code()
        admin = await session.get(PlatformAdminModel, row.admin_id)
        if admin is None or admin.disabled_at or admin.totp_secret is None:
            raise _invalid_code()
        unix = int(now.timestamp())
        codes: list[str] = []
        if code is not None and totp.verify(admin.totp_secret, code, unix):
            if admin.totp_enabled_at is None:  # setup proven: switch 2FA on, hand out codes
                admin.totp_enabled_at = now
                codes = [secrets.token_hex(5) for _ in range(RECOVERY_CODES)]
                await session.execute(
                    delete(PlatformRecoveryCodeModel).where(
                        PlatformRecoveryCodeModel.admin_id == admin.id
                    )
                )
                session.add_all(
                    PlatformRecoveryCodeModel(
                        id=new_ulid(), admin_id=admin.id, code_hash=identity.hash_token(c)
                    )
                    for c in codes
                )
        elif recovery_code is not None and admin.totp_enabled_at is not None:
            used = await session.execute(
                update(PlatformRecoveryCodeModel)
                .where(
                    PlatformRecoveryCodeModel.admin_id == admin.id,
                    PlatformRecoveryCodeModel.code_hash
                    == identity.hash_token(recovery_code.strip().lower()),
                    PlatformRecoveryCodeModel.used_at.is_(None),
                )
                .values(used_at=now)
            )
            if used.rowcount != 1:  # type: ignore[attr-defined]  # CursorResult of an UPDATE
                raise _invalid_code()
        else:
            raise _invalid_code()
        row.revoked_at = now
        token, expires_at = _issue(session, admin.id, now, stage="session")
        return admin.id, Session(token, expires_at, codes)


async def reset_two_factor(system: async_sessionmaker[AsyncSession], admin_id: str) -> None:
    """A lost authenticator: 2FA is set up again at the next sign-in; open sessions end."""
    async with system() as session, session.begin():
        admin = await session.get(PlatformAdminModel, admin_id)
        if admin is None:
            raise DomainError("OPERATOR_NOT_FOUND", "Operator not found", kind="not_found")
        admin.totp_secret, admin.totp_enabled_at = None, None
        await session.execute(
            delete(PlatformRecoveryCodeModel).where(PlatformRecoveryCodeModel.admin_id == admin_id)
        )
        await session.execute(
            update(PlatformTokenModel)
            .where(PlatformTokenModel.admin_id == admin_id, PlatformTokenModel.revoked_at.is_(None))
            .values(revoked_at=func.now())
        )


async def resolve_admin(system: async_sessionmaker[AsyncSession], token: str) -> str | None:
    async with system() as session:
        return await session.scalar(
            select(PlatformTokenModel.admin_id)
            .join(PlatformAdminModel, PlatformAdminModel.id == PlatformTokenModel.admin_id)
            .where(
                PlatformTokenModel.token_hash == identity.hash_token(token),
                PlatformTokenModel.stage == "session",  # a challenge never opens the console
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
