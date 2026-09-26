from collections.abc import Callable
from datetime import date

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.reporting.infrastructure.projector import project_daily_sales
from poslite.shared.domain.ids import new_ulid
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork


async def rebuild(
    *,
    system: async_sessionmaker[AsyncSession],
    app: async_sessionmaker[AsyncSession],
    start: str,
    end: str,
    new_id: Callable[[], str] = new_ulid,
) -> int:
    """Recompute the read model for every outlet-day with orders in [start, end] (05 "Reporting").

    Finding the outlet-days spans tenants (poslite_system); each one is projected in its own
    tenant-scoped transaction. Returns the number of outlet-days rebuilt.
    """
    async with system() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT DISTINCT tenant_id, outlet_id, business_date FROM orders"
                    " WHERE business_date BETWEEN :start AND :end ORDER BY business_date"
                ),
                {"start": date.fromisoformat(start), "end": date.fromisoformat(end)},
            )
        ).all()
    for tenant_id, outlet_id, day in rows:
        async with SqlAlchemyUnitOfWork(app, tenant_id=tenant_id, new_id=new_id) as uow:
            await project_daily_sales(uow, outlet_id, day)
            await uow.commit()
    return len(rows)
