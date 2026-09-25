from collections.abc import AsyncIterator, Callable

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.shared.application.clock import Clock
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork
from poslite.shared.presentation.security import Principal


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


async def open_uow(request: Request, tenant_id: str) -> AsyncIterator[SqlAlchemyUnitOfWork]:
    async with SqlAlchemyUnitOfWork(
        app_sessions(request), tenant_id=tenant_id, new_id=id_factory(request)
    ) as uow:
        yield uow


async def tenant_uow(request: Request, principal: Principal) -> AsyncIterator[SqlAlchemyUnitOfWork]:
    """One tenant-scoped transaction per request; the router commits (ADR-010)."""
    async for uow in open_uow(request, principal.tenant_id):
        yield uow
