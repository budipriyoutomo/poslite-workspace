from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.shared.application.clock import Clock
from poslite.shared.application.object_storage import ObjectStorage
from poslite.shared.application.payment_gateway import PaymentGateway
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork


def app_sessions(request: Request) -> async_sessionmaker[AsyncSession]:
    sessions: async_sessionmaker[AsyncSession] = request.app.state.app_sessions
    return sessions


def system_sessions(request: Request) -> async_sessionmaker[AsyncSession]:
    """BYPASSRLS sessions: only for lookups that happen before a tenant is known."""
    sessions: async_sessionmaker[AsyncSession] = request.app.state.system_sessions
    return sessions


def payment_gateway(request: Request) -> PaymentGateway:
    value: PaymentGateway = request.app.state.gateway
    return value


def object_storage(request: Request) -> ObjectStorage:
    value: ObjectStorage = request.app.state.storage
    return value


def media_base_url(request: Request) -> str:
    """Where stored objects are served from (ADR-021); keys are joined to it on the way out."""
    value: str = request.app.state.media_base_url
    return value


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
