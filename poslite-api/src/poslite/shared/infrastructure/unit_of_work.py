from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Self

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.shared.domain.events import DomainEvent
from poslite.shared.infrastructure.outbox import OutboxMessageModel
from poslite.shared.infrastructure.tenancy import set_tenant


class SqlAlchemyUnitOfWork:
    """One tenant-scoped transaction, owned by the entrypoint (ADR-010).

    Use cases write through `session` and `record()` domain events; only the entrypoint calls
    `commit()`, which stores the surviving events in `outbox_messages` in the same transaction.
    Leaving the block without committing rolls everything back.
    """

    def __init__(
        self,
        factory: async_sessionmaker[AsyncSession],
        *,
        tenant_id: str,
        new_id: Callable[[], str],
    ) -> None:
        self._factory = factory
        self.tenant_id = tenant_id
        self._new_id = new_id
        self._events: list[DomainEvent] = []
        self.session: AsyncSession

    async def __aenter__(self) -> Self:
        self.session = self._factory()
        await self.session.begin()
        await set_tenant(self.session, self.tenant_id)
        return self

    async def __aexit__(self, *exc: object) -> None:
        if self.session.in_transaction():
            await self.session.rollback()
        await self.session.close()

    def new_id(self) -> str:
        """A ULID for a row the server creates itself (never for device ids)."""
        return self._new_id()

    def record(self, event: DomainEvent) -> None:
        self._events.append(event)

    @asynccontextmanager
    async def savepoint(self) -> AsyncIterator[None]:
        """Nested transaction; if it rolls back, the events recorded inside are discarded too."""
        mark = len(self._events)
        try:
            async with self.session.begin_nested():
                yield
        except BaseException:
            del self._events[mark:]
            raise

    async def lock_device(self, device_id: str) -> None:
        """Serialize work per device until commit (pushes from one device never interleave)."""
        await self.session.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:id))"), {"id": device_id}
        )

    async def commit(self) -> None:
        self.session.add_all(
            OutboxMessageModel(
                id=self._new_id(), tenant_id=self.tenant_id, topic=e.topic, payload=e.to_payload()
            )
            for e in self._events
        )
        self._events.clear()
        await self.session.commit()
