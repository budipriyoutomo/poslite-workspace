import json
from pathlib import Path
from typing import Any

from poslite.sales.api import PlaceOrderHandler, RefundOrderHandler, VoidOrderHandler
from poslite.shared.application.sync import DeviceContext
from poslite.shift.api import CloseShiftHandler, MoveCashHandler, OpenShiftHandler
from poslite.sync.application.events import IncomingEvent
from poslite.sync.application.push_events import EventRegistry, EventResult, PushEventsHandler

from ..fakes import (
    FakeApprovers,
    FakeCashiers,
    FakeOutlets,
    FakePushUnitOfWork,
    FakeShiftStatuses,
)

RAW: list[dict[str, Any]] = json.loads(
    (Path(__file__).parents[2] / "fixtures" / "sync-events.json").read_text()
)
EVENTS = [IncomingEvent.model_validate(e) for e in RAW]
CORRECTIONS = [
    IncomingEvent.model_validate(e)
    for e in json.loads(
        (Path(__file__).parents[2] / "fixtures" / "correction-events.json").read_text()
    )
]
CASHIER = RAW[0]["payload"]["opened_by"]
MANAGER = "01K5ZA00000000000000000002"  # approves voids and refunds in correction-events.json
CTX = DeviceContext(tenant_id="TN", device_id="D1", outlet_id="T1")


class InMemorySyncEvents:
    def __init__(self, uow: FakePushUnitOfWork) -> None:
        self._uow = uow

    async def status_of(self, event_id: str) -> str | None:
        return await self._uow.status_of(event_id)

    async def save(self, event: IncomingEvent, device_id: str, result: EventResult) -> None:
        self._uow.sync_events[event.id] = (result.status, result.code)


def push_handler(
    uow: FakePushUnitOfWork,
    cashiers: set[str] | None = None,
    approvers: set[str] | None = None,
) -> PushEventsHandler:
    allowed = FakeCashiers({CASHIER} if cashiers is None else cashiers)
    approving = FakeApprovers({MANAGER} if approvers is None else approvers)
    shifts = FakeShiftStatuses(uow.shifts)
    return PushEventsHandler(
        EventRegistry(
            place_order=PlaceOrderHandler(FakeOutlets(), allowed),
            open_shift=OpenShiftHandler(FakeOutlets(), allowed),
            close_shift=CloseShiftHandler(allowed),
            move_cash=MoveCashHandler(allowed),
            void_order=VoidOrderHandler(allowed, approving, shifts),
            refund_order=RefundOrderHandler(FakeOutlets(), allowed, approving, shifts),
        )
    )


def new_uow() -> FakePushUnitOfWork:
    return FakePushUnitOfWork()


async def run(
    uow: FakePushUnitOfWork, events: list[IncomingEvent], handler: PushEventsHandler | None = None
) -> list[EventResult]:
    return await (handler or push_handler(uow))(CTX, events, uow, InMemorySyncEvents(uow))


async def test_applies_a_batch_in_order_and_stores_every_result() -> None:
    uow = new_uow()

    results = await run(uow, EVENTS)

    assert [r.status for r in results] == ["accepted"] * len(EVENTS)
    assert uow.shifts.rows[EVENTS[0].aggregate_id].status == "closed"
    assert set(uow.sync_events) == {e.id for e in EVENTS}
    assert uow.locked == ["D1"]
    assert uow.committed is False


async def test_a_replayed_batch_is_answered_with_duplicates() -> None:
    uow = new_uow()
    await run(uow, EVENTS)

    results = await run(uow, EVENTS)

    assert [r.status for r in results] == ["duplicate"] * len(EVENTS)
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
    first = await run(uow, EVENTS[:1], push_handler(uow, cashiers=set()))
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


# ── Corrections (ADR-023) ────────────────────────────────────────────────────────────────────

OPENED, PLACED, CLOSED = EVENTS[0], EVENTS[2], EVENTS[3]
REFUNDED, SECOND_ORDER, VOIDED = CORRECTIONS


async def test_voids_and_refunds_in_the_shift_before_it_closes() -> None:
    uow = new_uow()

    results = await run(uow, [OPENED, PLACED, *CORRECTIONS, CLOSED])

    assert [r.status for r in results] == ["accepted"] * 6
    assert (list(uow.orders.voids), list(uow.orders.refunds)) == (
        [VOIDED.aggregate_id],
        [REFUNDED.aggregate_id],
    )


def _with(event: IncomingEvent, **payload: object) -> IncomingEvent:
    return event.model_copy(update={"payload": {**event.payload, **payload}})


async def test_an_approver_without_the_permission_rejects_the_correction() -> None:
    uow = new_uow()
    handler = push_handler(uow, approvers=set())

    results = await run(uow, [OPENED, PLACED, SECOND_ORDER, VOIDED, REFUNDED], handler)

    assert [(r.status, r.code) for r in results][3:] == [
        ("rejected", "APPROVER_NOT_ALLOWED"),
        ("rejected", "APPROVER_NOT_ALLOWED"),
    ]


async def test_a_void_after_its_shift_closed_is_rejected() -> None:
    uow = new_uow()

    results = await run(uow, [OPENED, SECOND_ORDER, CLOSED, VOIDED])

    assert (results[-1].status, results[-1].code) == ("rejected", "VOID_NOT_ALLOWED")


async def test_a_correction_of_an_unknown_order_is_rejected() -> None:
    uow = new_uow()

    results = await run(uow, [OPENED, VOIDED, REFUNDED])

    assert [r.code for r in results[1:]] == ["ORDER_NOT_FOUND", "ORDER_NOT_FOUND"]


async def test_two_refunds_of_the_last_unit_are_both_kept_and_the_second_is_flagged() -> None:
    uow = new_uow()
    lines = [{**REFUNDED.payload["lines"][0], "quantity": 2, "amount": 72_765}]  # type: ignore[index]
    payments = [{**REFUNDED.payload["payments"][0], "amount": 72_765}]  # type: ignore[index]
    first = _with(REFUNDED, lines=lines, total=72_765, payments=payments)
    again = _with(
        first,
        refund_no="JKT01A-R260925-0002",
        payments=[{**payments[0], "id": "01K5ZY20000000000000000002"}],
    ).model_copy(
        update={"id": "01K5ZE00000000000000000009", "aggregate_id": "01K5ZF00000000000000000002"}
    )

    results = await run(uow, [OPENED, PLACED, first, again])

    assert [(r.status, r.flags) for r in results[2:]] == [
        ("accepted", ()),
        ("flagged", ("REFUND_EXCEEDS_ORDER",)),
    ]
