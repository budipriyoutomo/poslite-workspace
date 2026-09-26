import hashlib
import secrets
from collections.abc import Awaitable, Callable, Iterable
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.identity.infrastructure.models import ApiTokenModel
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork
from poslite.shared.presentation.security import Principal


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def issue_token(
    uow: SqlAlchemyUnitOfWork,
    *,
    token_id: str,
    owner_type: str,
    owner_id: str,
    abilities: Iterable[str],
    expires_at: datetime | None,
) -> str:
    """Opaque random token; only its SHA-256 is stored, so it can be revoked instantly."""
    token = secrets.token_urlsafe(32)
    uow.session.add(
        ApiTokenModel(
            id=token_id,
            tenant_id=uow.tenant_id,
            owner_type=owner_type,
            owner_id=owner_id,
            token_hash=hash_token(token),
            abilities=sorted(abilities),
            expires_at=expires_at,
        )
    )
    await uow.session.flush()
    return token


async def revoke_token(uow: SqlAlchemyUnitOfWork, token_id: str) -> None:
    await uow.session.execute(
        update(ApiTokenModel).where(ApiTokenModel.id == token_id).values(revoked_at=func.now())
    )


class SqlTokenResolver:
    """Looks a token up before the tenant is known — the one narrow query run as poslite_system."""

    def __init__(
        self,
        system: async_sessionmaker[AsyncSession],
        tenant_status: Callable[[AsyncSession, str], Awaitable[str | None]],
    ) -> None:
        # tenant_status is injected (tenancy module) so identity does not depend on tenancy.
        self._system, self._tenant_status = system, tenant_status

    async def resolve(self, token: str) -> Principal | None:
        async with self._system() as session:
            row = (
                await session.execute(
                    select(ApiTokenModel).where(
                        ApiTokenModel.token_hash == hash_token(token),
                        ApiTokenModel.revoked_at.is_(None),
                        (ApiTokenModel.expires_at.is_(None))
                        | (ApiTokenModel.expires_at > func.now()),
                    )
                )
            ).scalar_one_or_none()
            status = await self._tenant_status(session, row.tenant_id) if row else None
        if row is None:
            return None
        return Principal(
            token_id=row.id,
            tenant_id=row.tenant_id,
            owner_type=row.owner_type,
            owner_id=row.owner_id,
            abilities=frozenset(row.abilities),
            tenant_status=status or "active",
        )


async def revoke_tokens_of(uow: SqlAlchemyUnitOfWork, *, owner_type: str, owner_id: str) -> None:
    await uow.session.execute(
        update(ApiTokenModel)
        .where(
            ApiTokenModel.owner_type == owner_type,
            ApiTokenModel.owner_id == owner_id,
            ApiTokenModel.revoked_at.is_(None),
        )
        .values(revoked_at=func.now())
    )
