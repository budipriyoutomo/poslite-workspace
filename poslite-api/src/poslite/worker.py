"""arq worker (Fase 2): delivers the transactional outbox to projectors every 5 seconds.

Run with `make worker` (needs a local Redis). The job itself needs no Redis and is tested directly.
"""

from typing import Any, ClassVar

from arq import cron
from arq.connections import RedisSettings
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.reporting.api import subscribers
from poslite.shared.config import get_settings
from poslite.shared.domain.ids import new_ulid
from poslite.shared.infrastructure.database import create_engine, session_factory
from poslite.shared.infrastructure.outbox_relay import RelayStats, relay_outbox


async def relay_job(ctx: dict[str, Any]) -> RelayStats:
    app: async_sessionmaker[AsyncSession] = ctx["app_sessions"]
    system: async_sessionmaker[AsyncSession] = ctx["system_sessions"]
    return await relay_outbox(system=system, app=app, subscribers=subscribers(), new_id=new_ulid)


async def startup(ctx: dict[str, Any]) -> None:
    settings = get_settings()
    ctx["app_engine"] = create_engine(settings.database_url)
    ctx["system_engine"] = create_engine(settings.system_database_url)
    ctx["app_sessions"] = session_factory(ctx["app_engine"])
    ctx["system_sessions"] = session_factory(ctx["system_engine"])


async def shutdown(ctx: dict[str, Any]) -> None:
    await ctx["app_engine"].dispose()
    await ctx["system_engine"].dispose()


class WorkerSettings:
    functions: ClassVar = [relay_job]
    cron_jobs: ClassVar = [cron(relay_job, second=set(range(0, 60, 5)), run_at_startup=True)]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
