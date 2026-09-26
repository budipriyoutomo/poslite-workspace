import json
from pathlib import Path
from typing import Any

from poslite.sales.api import PlaceOrderHandler
from poslite.shared.application.sync import DeviceContext
from poslite.shift.api import CloseShiftHandler, MoveCashHandler, OpenShiftHandler
from poslite.sync.application.events import IncomingEvent
from poslite.sync.application.push_events import EventRegistry, EventResult, PushEventsHandler

from ..fakes import FakeCashiers, FakeOutlets, FakePushUnitOfWork

RAW: list[dict[str, Any]] = json.loads(
    (Path(__file__).parents[2] / "fixtures" / "sync-events.json").read_text()
)
EVENTS = [IncomingEvent.model_validate(e) for e in RAW]
CASHIER = RAW[0]["payload"]["opened_by"]
CTX = DeviceContext(tenant_id="TN", device_id="D1", outlet_id="T1")


class InMemorySyncEvents:
    def __init__(self, uow: FakePushUnitOfWork) -> None:
        self._uow = uow

    async def status_of(self, event_id: str) -> str | None:
        return await self._uow.status_of(event_id)

    async def save(self, event: IncomingEvent, device_id: str, result: EventResult) -> None:
        self._uow.sync_events[event.id] = (result.status, result.code)


def push_handler(cashiers: set[str] | None = None) -> PushEventsHandler:
    allowed = FakeCashiers({CASHIER} if cashiers is None else cashiers)
    return PushEventsHandler(
        EventRegistry(
            place_order=PlaceOrderHandler(FakeOutlets(), allowed),
            open_shift=OpenShiftHandler(FakeOutlets(), allowed),
            close_shift=CloseShiftHandler(allowed),
            move_cash=MoveCashHandler(allowed),
        )
    )


def new_uow() -> FakePushUnitOfWork:
    return FakePushUnitOfWork()


async def run(
    uow: FakePushUnitOfWork, events: list[IncomingEvent], handler: PushEventsHandler | None = None
) -> list[EventResult]:
    return await (handler or push_handler())(CTX, events, uow, InMemorySyncEvents(uow))


async def test_applies_a_batch_in_order_and_stores_every_result() -> None:
    uow = new_uow()

    results = await run(uow, EVENTS)

    assert [r.status for r in results] == ["accepted"] * 4
    assert uow.shifts.rows[EVENTS[0].aggregate_id].status == "closed"
    assert set(uow.sync_events) == {e.id for e in EVENTS}
    assert uow.locked == ["D1"]
    assert uow.committed is False


async def test_a_replayed_batch_is_answered_with_duplicates() -> None:
    uow = new_uow()
    await run(uow, EVENTS)

    results = await run(uow, EVENTS)

    assert [r.status for r in results] == ["duplicate"] * 4
    assert len(uow.orders.rows) == 1


async def test_a_rejected_event_does_not_undo_the_others() -> None:
    uow = new_uow()
    broken = EVENTS[1].model_copy(update={"payload": {**EVENTS[1].payload, "amount": 0}})

    results = await run(uow, [EVENTS[0], broken, EVENTS[2]])

    assert [(r.status, r.code) for r in results] == [
        ("accepted", None),
        ("rejected", "SCHEMA_INVALID"),
        ("accepted", None),
    ]
    assert uow.shifts.movements == []
    assert len(uow.orders.rows) == 1


async def test_a_previously_rejected_event_is_processed_again() -> None:
    uow = new_uow()
    first = await run(uow, EVENTS[:1], push_handler(cashiers=set()))
    assert (first[0].status, first[0].code) == ("rejected", "CASHIER_NOT_IN_OUTLET")

    again = await run(uow, EVENTS[:1])

    assert again[0].status == "accepted"
    assert EVENTS[0].aggregate_id in uow.shifts.rows


async def test_flags_are_returned() -> None:
    uow = new_uow()
    tampered = EVENTS[2].model_copy(
        update={
            "payload": {
                **EVENTS[2].payload,
                "totals": {**EVENTS[2].payload["totals"], "tax": 6000, "total": 72150},
            }
        }
    )  # type: ignore[dict-item]

    results = await run(uow, [EVENTS[0], tampered])

    assert (results[1].status, results[1].flags) == ("flagged", ("TOTAL_MISMATCH",))
