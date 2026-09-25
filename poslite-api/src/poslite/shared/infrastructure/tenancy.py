from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession


async def set_tenant(conn: AsyncConnection | AsyncSession, tenant_id: str) -> None:
    """Scope the current transaction to one tenant for RLS (transaction-local: pool-safe)."""
    await conn.execute(text("SELECT set_config('app.tenant_id', :tid, true)"), {"tid": tenant_id})
