"""arq worker: delivers the transactional outbox to projectors and webhooks every 5 seconds,
and sends outgoing webhooks every 10 seconds (ADR-012, ADR-020).

Run with `make worker` (needs a local Redis). The job itself needs no Redis and is tested directly.
"""

from datetime import UTC, datetime
from typing import Any, ClassVar

import httpx
from arq import cron
from arq.connections import RedisSettings
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.integration.api import DeliveryStats, deliver_webhooks
from poslite.integration.api import subscribers as webhook_subscribers
from poslite.reporting.api import subscribers as report_subscribers
from poslite.shared.config import get_settings
from poslite.shared.domain.ids import new_ulid
from poslite.shared.infrastructure.database import create_engine, session_factory
from poslite.shared.infrastructure.outbox_relay import (
    RelayStats,
    combine_subscribers,
    relay_outbox,
)


async def relay_job(ctx: dict[str, Any]) -> RelayStats:
    app: async_sessionmaker[AsyncSession] = ctx["app_sessions"]
    system: async_sessionmaker[AsyncSession] = ctx["system_sessions"]
    return await relay_outbox(
        system=system,
        app=app,
        subscribers=combine_subscribers(report_subscribers(), webhook_subscribers()),
        new_id=new_ulid,
    )


async def webhook_job(ctx: dict[str, Any]) -> DeliveryStats:
    """Outgoing webhooks (ADR-020): send due deliveries with a short timeout per request."""
    client: httpx.AsyncClient = ctx["http"]

    async def send(url: str, body: bytes, headers: dict[str, str]) -> int:
        return (await client.post(url, content=body, headers=headers)).status_code

    return await deliver_webhooks(
        system=ctx["system_sessions"], send=send, now=lambda: datetime.now(UTC)
    )


async def startup(ctx: dict[str, Any]) -> None:
    settings = get_settings()
    ctx["app_engine"] = create_engine(settings.database_url)
    ctx["system_engine"] = create_engine(settings.system_database_url)
    ctx["app_sessions"] = session_factory(ctx["app_engine"])
    ctx["system_sessions"] = session_factory(ctx["system_engine"])
    ctx["http"] = httpx.AsyncClient(timeout=10.0, follow_redirects=False)


async def shutdown(ctx: dict[str, Any]) -> None:
    await ctx["app_engine"].dispose()
    await ctx["system_engine"].dispose()
    await ctx["http"].aclose()


class WorkerSettings:
    functions: ClassVar = [relay_job, webhook_job]
    cron_jobs: ClassVar = [
        cron(relay_job, second=set(range(0, 60, 5)), run_at_startup=True),
        cron(webhook_job, second=set(range(2, 60, 10))),
    ]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
