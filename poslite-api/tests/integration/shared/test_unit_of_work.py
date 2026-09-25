"""ADR-010/012: the entrypoint owns the transaction; domain events reach the outbox atomically."""

from collections.abc import Callable
from dataclasses import dataclass

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from poslite.shared.domain.events import DomainEvent
from poslite.shared.infrastructure.tenancy import set_tenant
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork

TENANT = "01K5ZT00000000000000000001"


@dataclass(frozen=True, slots=True)
class SomethingHappened(DomainEvent):
    what: str

    topic = "test.something_happened"

    def to_payload(self) -> dict[str, object]:
        return {"what": self.what}


class BoomError(Exception):
    pass


@pytest.fixture
async def tenant(system_engine: AsyncEngine) -> None:
    async with system_engine.begin() as conn:
        await conn.execute(
            text("INSERT INTO tenants (id, slug, name) VALUES (:id, 'a', 'A')"), {"id": TENANT}
        )


def _ids() -> Callable[[], str]:
    counter = iter(range(1, 1000))
    return lambda: f"01K5ZE{next(counter):020d}"


def _uow(app_engine: AsyncEngine) -> SqlAlchemyUnitOfWork:
    return SqlAlchemyUnitOfWork(async_sessionmaker(app_engine), tenant_id=TENANT, new_id=_ids())


async def _outbox(app_engine: AsyncEngine) -> list[tuple[str, dict[str, object]]]:
    async with app_engine.begin() as conn:
        await set_tenant(conn, TENANT)
        rows = await conn.execute(text("SELECT topic, payload FROM outbox_messages ORDER BY id"))
        return [(r.topic, r.payload) for r in rows]


@pytest.mark.usefixtures("tenant")
async def test_commit_writes_recorded_events_to_the_outbox(app_engine: AsyncEngine) -> None:
    async with _uow(app_engine) as uow:
        uow.record(SomethingHappened("sold"))
        await uow.commit()

    assert await _outbox(app_engine) == [("test.something_happened", {"what": "sold"})]


async def _record_then_fail(app_engine: AsyncEngine) -> None:
    async with _uow(app_engine) as uow:
        uow.record(SomethingHappened("sold"))
        raise BoomError


@pytest.mark.usefixtures("tenant")
async def test_leaving_without_commit_rolls_back(app_engine: AsyncEngine) -> None:
    with pytest.raises(BoomError):
        await _record_then_fail(app_engine)

    assert await _outbox(app_engine) == []


async def _failing_savepoint(uow: SqlAlchemyUnitOfWork) -> None:
    async with uow.savepoint():
        uow.record(SomethingHappened("discarded"))
        raise BoomError


@pytest.mark.usefixtures("tenant")
async def test_rolled_back_savepoint_discards_its_events_but_keeps_the_rest(
    app_engine: AsyncEngine,
) -> None:
    async with _uow(app_engine) as uow:
        uow.record(SomethingHappened("kept"))
        with pytest.raises(BoomError):
            await _failing_savepoint(uow)
        async with uow.savepoint():
            uow.record(SomethingHappened("also kept"))
        await uow.commit()

    assert [p["what"] for _, p in await _outbox(app_engine)] == ["kept", "also kept"]


@pytest.mark.usefixtures("tenant")
async def test_runs_with_the_tenant_context(app_engine: AsyncEngine) -> None:
    async with _uow(app_engine) as uow:
        current = (
            await uow.session.execute(text("SELECT current_setting('app.tenant_id')"))
        ).scalar_one()

    assert current == TENANT
