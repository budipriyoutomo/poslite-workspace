from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork
from poslite.tenancy.infrastructure.models import TenantModel


@dataclass(frozen=True, slots=True)
class TenantInfo:
    id: str
    slug: str
    name: str
    status: str


def _info(t: TenantModel) -> TenantInfo:
    return TenantInfo(id=t.id, slug=t.slug, name=t.name, status=t.status)


async def slug_taken(system: async_sessionmaker[AsyncSession], slug: str) -> bool:
    async with system() as session:
        return (
            await session.scalar(select(TenantModel.id).where(TenantModel.slug == slug))
        ) is not None


async def create_tenant(
    uow: SqlAlchemyUnitOfWork, *, slug: str, name: str, timezone: str
) -> TenantInfo:
    tenant = TenantModel(
        id=uow.tenant_id, slug=slug, name=name, status="active", default_timezone=timezone
    )
    uow.session.add(tenant)
    await uow.session.flush()
    return _info(tenant)


async def get_tenant(uow: SqlAlchemyUnitOfWork) -> TenantInfo:
    tenant = await uow.session.get_one(TenantModel, uow.tenant_id)
    return _info(tenant)


async def tenant_status(session: AsyncSession, tenant_id: str) -> str | None:
    """Status lookup for token resolution (runs as poslite_system, before a tenant context)."""
    return await session.scalar(select(TenantModel.status).where(TenantModel.id == tenant_id))


@dataclass(frozen=True, slots=True)
class TenantSignup:
    id: str
    created_at: datetime


async def all_tenants(session: AsyncSession) -> list[TenantSignup]:
    """Every tenant and when it signed up (poslite_system: the billing job spans tenants)."""
    rows = await session.execute(select(TenantModel.id, TenantModel.created_at))
    return [TenantSignup(i, c) for i, c in rows]


async def suspend_for_billing(session: AsyncSession, tenant_id: str) -> bool:
    """Unpaid invoice past grace (ADR-018). A tenant already suspended keeps its reason."""
    result = await session.execute(
        update(TenantModel)
        .where(TenantModel.id == tenant_id, TenantModel.status == "active")
        .values(status="suspended", suspended_at=func.now(), suspended_reason="billing")
    )
    return bool(result.rowcount)  # type: ignore[attr-defined]  # CursorResult of an UPDATE


async def reactivate_after_payment(session: AsyncSession, tenant_id: str) -> None:
    """Lifts only a billing suspension; an operator's suspension stays (ADR-018)."""
    await session.execute(
        update(TenantModel)
        .where(TenantModel.id == tenant_id, TenantModel.suspended_reason == "billing")
        .values(status="active", suspended_at=None, suspended_reason=None)
    )
