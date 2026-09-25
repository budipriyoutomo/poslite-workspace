from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.shared.application.clock import Clock
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork


def app_sessions(request: Request) -> async_sessionmaker[AsyncSession]:
    sessions: async_sessionmaker[AsyncSession] = request.app.state.app_sessions
    return sessions


def system_sessions(request: Request) -> async_sessionmaker[AsyncSession]:
    """BYPASSRLS sessions: only for lookups that happen before a tenant is known."""
    sessions: async_sessionmaker[AsyncSession] = request.app.state.system_sessions
    return sessions


def clock(request: Request) -> Clock:
    value: Clock = request.app.state.clock
    return value


def id_factory(request: Request) -> Callable[[], str]:
    value: Callable[[], str] = request.app.state.new_id
    return value


@asynccontextmanager
async def open_uow(request: Request, tenant_id: str) -> AsyncIterator[SqlAlchemyUnitOfWork]:
    """One tenant-scoped transaction; the router commits it (ADR-010), otherwise it rolls back."""
    async with SqlAlchemyUnitOfWork(
        app_sessions(request), tenant_id=tenant_id, new_id=id_factory(request)
    ) as uow:
        yield uow
