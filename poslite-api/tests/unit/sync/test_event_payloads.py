import json
from pathlib import Path
from typing import Any

import pytest

from poslite.sales.api import Discount, PlaceOrderData
from poslite.shared.domain.errors import DomainError
from poslite.shift.api import CloseShift, MoveCash, OpenShift
from poslite.sync.application.events import IncomingEvent, to_command

EVENTS: list[dict[str, Any]] = json.loads(
    (Path(__file__).parents[2] / "fixtures" / "sync-events.json").read_text()
)
VARIANTS: list[dict[str, Any]] = json.loads(
    (Path(__file__).parents[2] / "fixtures" / "order-placed-variants.json").read_text()
)
COMMAND = {
    "shift.opened": OpenShift,
    "cash.moved": MoveCash,
    "order.placed": PlaceOrderData,
    "shift.closed": CloseShift,
}


@pytest.mark.parametrize("event", EVENTS, ids=[e["type"] for e in EVENTS])
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


def test_rejects_an_event_type_it_does_not_handle_yet() -> None:
    event = {**EVENTS[0], "type": "order.voided", "payload": {}}

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
