import json
from pathlib import Path
from typing import Any

import pytest

from poslite.sales.api import (
    Discount,
    PlaceOrderData,
    RefundOrderData,
    VoidBillItemsData,
    VoidOrderData,
)
from poslite.shared.domain.errors import DomainError
from poslite.shift.api import CloseShift, MoveCash, OpenShift
from poslite.sync.application.events import IncomingEvent, to_command

EVENTS: list[dict[str, Any]] = json.loads(
    (Path(__file__).parents[2] / "fixtures" / "sync-events.json").read_text()
)
CORRECTIONS: list[dict[str, Any]] = json.loads(
    (Path(__file__).parents[2] / "fixtures" / "correction-events.json").read_text()
)
BILL_VOIDS: list[dict[str, Any]] = json.loads(
    (Path(__file__).parents[2] / "fixtures" / "bill-void-events.json").read_text()
)
VARIANTS: list[dict[str, Any]] = json.loads(
    (Path(__file__).parents[2] / "fixtures" / "order-placed-variants.json").read_text()
)
COMMAND = {
    "shift.opened": OpenShift,
    "cash.moved": MoveCash,
    "order.placed": PlaceOrderData,
    "shift.closed": CloseShift,
    "order.voided": VoidOrderData,
    "order.refunded": RefundOrderData,
    "bill.item_voided": VoidBillItemsData,
}


@pytest.mark.parametrize(
    "event",
    EVENTS + CORRECTIONS + BILL_VOIDS,
    ids=[e["type"] for e in EVENTS + CORRECTIONS + BILL_VOIDS],
)
def test_accepts_every_payload_the_device_sends(event: dict[str, Any]) -> None:
    """Same fixture as poslite-web's Zod contract test."""
    command = to_command(IncomingEvent.model_validate(event))

    assert isinstance(command, COMMAND[event["type"]])


def test_maps_order_placed_into_the_domain_command() -> None:
    event = next(e for e in EVENTS if e["type"] == "order.placed")

    command = to_command(IncomingEvent.model_validate(event))

    assert isinstance(command, PlaceOrderData)
    assert command.order_id == event["aggregate_id"]
    assert command.totals.total == 72_765
    assert command.lines[0].modifiers[0].price == 10_000
    assert command.occurred_at.isoformat() == "2026-09-25T04:03:00+00:00"


@pytest.mark.parametrize(
    "broken",
    [
        {"opening_cash": 200_000.5, "opened_by": "01K5ZA00000000000000000001"},
        {"opening_cash": 200_000},
        {"opening_cash": 200_000, "opened_by": "not-a-ulid"},
    ],
)
def test_rejects_a_payload_that_breaks_the_contract(broken: dict[str, Any]) -> None:
    event = {**EVENTS[0], "payload": broken}

    with pytest.raises(DomainError) as err:
        to_command(IncomingEvent.model_validate(event))

    assert err.value.code == "SCHEMA_INVALID"


def test_rejects_a_payment_reference_longer_than_the_column() -> None:
    event = next(e for e in EVENTS if e["type"] == "order.placed")
    payments = [{**p, "reference": "R" * 65} for p in event["payload"]["payments"]]
    broken = {**event, "payload": {**event["payload"], "payments": payments}}

    with pytest.raises(DomainError) as err:
        to_command(IncomingEvent.model_validate(broken))

    assert err.value.code == "SCHEMA_INVALID"


def test_rejects_an_event_type_it_does_not_handle_yet() -> None:
    event = {**EVENTS[0], "type": "bill.merged", "payload": {}}

    with pytest.raises(DomainError) as err:
        to_command(IncomingEvent.model_validate(event))

    assert err.value.code == "UNSUPPORTED_EVENT_TYPE"


@pytest.mark.parametrize("variant", VARIANTS, ids=[v["name"] for v in VARIANTS])
def test_accepts_every_order_placed_variant(variant: dict[str, Any]) -> None:
    """Same fixture as poslite-web: dine-in, line discounts and promotion snapshots."""
    event = next(e for e in EVENTS if e["type"] == "order.placed")

    command = to_command(IncomingEvent.model_validate({**event, "payload": variant["payload"]}))

    assert isinstance(command, PlaceOrderData)


def test_maps_table_label_line_discount_and_promotion() -> None:
    event = next(e for e in EVENTS if e["type"] == "order.placed")
    payload = VARIANTS[0]["payload"]

    command = to_command(IncomingEvent.model_validate({**event, "payload": payload}))

    assert isinstance(command, PlaceOrderData)
    assert command.table_label == "A1"
    assert command.lines[0].discount == Discount("fixed", 18_000)
    assert command.lines[0].promotion == ("01K5ZQ00000000000000000001", "Beli 2 gratis 1")
    assert command.lines[1].promotion is None


def test_maps_bill_item_voided_into_the_domain_command() -> None:
    event = BILL_VOIDS[1]

    command = to_command(IncomingEvent.model_validate(event))

    assert isinstance(command, VoidBillItemsData)
    assert (command.void_id, command.scope, len(command.lines)) == (
        event["aggregate_id"],
        "bill_cancelled",
        2,
    )
    assert command.lines[0].modifiers == ()


@pytest.mark.parametrize(
    "broken",
    [
        {"scope": "everything"},
        {"lines": []},
        {"reason": ""},
        {"lines": [{**BILL_VOIDS[0]["payload"]["lines"][0], "amount": 35_001}]},
    ],
    ids=["unknown scope", "no lines", "empty reason", "amount is not price x quantity"],
)
def test_rejects_a_bill_void_that_breaks_the_contract(broken: dict[str, Any]) -> None:
    event = {**BILL_VOIDS[0], "payload": {**BILL_VOIDS[0]["payload"], **broken}}

    with pytest.raises(DomainError) as err:
        to_command(IncomingEvent.model_validate(event))

    assert err.value.code == "SCHEMA_INVALID"


SHIFT_CLOSED = next(e for e in EVENTS if e["type"] == "shift.closed")


def _closed_with(denominations: object) -> dict[str, Any]:
    return {**SHIFT_CLOSED, "payload": {**SHIFT_CLOSED["payload"], "denominations": denominations}}


def test_maps_the_count_per_denomination_of_a_blind_close() -> None:
    # 250.000 counted: 2 x 100.000, 2 x 20.000, 1 x 10.000 (JSON object keys are strings).
    event = _closed_with({"100000": 2, "20000": 2, "10000": 1})

    command = to_command(IncomingEvent.model_validate(event))

    assert isinstance(command, CloseShift)
    assert command.denominations == {100_000: 2, 20_000: 2, 10_000: 1}


def test_a_shift_closed_without_denominations_still_maps() -> None:
    command = to_command(IncomingEvent.model_validate(SHIFT_CLOSED))

    assert isinstance(command, CloseShift)
    assert command.denominations is None


@pytest.mark.parametrize(
    "denominations",
    [{"100000": -1}, {"0": 5}, {"100000": 1.5}, {"abc": 1}],
    ids=["negative pieces", "zero value", "fractional pieces", "non-numeric value"],
)
def test_rejects_denominations_that_break_the_contract(denominations: object) -> None:
    with pytest.raises(DomainError) as err:
        to_command(IncomingEvent.model_validate(_closed_with(denominations)))

    assert err.value.code == "SCHEMA_INVALID"
