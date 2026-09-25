from dataclasses import dataclass

from sqlalchemy import select
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
