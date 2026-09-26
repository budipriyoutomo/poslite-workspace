"""Fase 2 DoD (08-roadmap-and-testing.md): 2 devices offline for a day, 200 sales each → online →
everything on the server, no duplicates, unique receipt numbers."""

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from poslite.shared.domain.ids import new_ulid

from ..identity.helpers import SIGNUP
from .helpers import outlet_with_menu_and_device
from .test_push import push

ORDERS_PER_DEVICE = 200
DAY_START = datetime(2026, 9, 25, 2, 0, tzinfo=UTC)  # 09:00 WIB


async def second_device(api: AsyncClient, outlet_id: str) -> tuple[str, str]:
    body = {
        "email": SIGNUP["email"],
        "password": SIGNUP["password"],
        "outlet_id": outlet_id,
        "device_name": "Kasir 2",
    }
    data = (await api.post("/api/v1/devices/activate", json=body)).json()["data"]
    return data["token"], data["device"]["code"]


def day_of_sales(device_code: str, cashier: str, product: str, cash: str) -> list[dict[str, Any]]:
    """A device outbox after a day offline: shift.opened, 200 order.placed, shift.closed."""
    shift = new_ulid()
    at = lambda minutes: (DAY_START + timedelta(minutes=minutes)).isoformat()  # noqa: E731
    events: list[dict[str, Any]] = [
        {
            "id": new_ulid(),
            "type": "shift.opened",
            "aggregate_id": shift,
            "occurred_at": at(0),
            "payload": {"opening_cash": 200_000, "opened_by": cashier},
        }
    ]
    for n in range(1, ORDERS_PER_DEVICE + 1):
        quantity = 1 + n % 3  # 5.000 each; service 5 %, PB1 10 %
        subtotal = 5_000 * quantity
        service = (2 * subtotal * 500 + 10_000) // 20_000
        tax = (2 * (subtotal + service) * 1_000 + 10_000) // 20_000
        total = subtotal + service + tax
        events.append(
            {
                "id": new_ulid(),
                "type": "order.placed",
                "aggregate_id": new_ulid(),
                "occurred_at": at(n * 3),
                "payload": {
                    "shift_id": shift,
                    "receipt_no": f"JKT01{device_code}-260925-{n:04d}",
                    "cashier_id": cashier,
                    "order_type": "take_away",
                    "lines": [
                        {
                            "id": new_ulid(),
                            "product_id": product,
                            "product_name": "Es Teh",
                            "category_name": "Minuman",
                            "unit_price": 5_000,
                            "quantity": quantity,
                            "notes": "",
                            "modifiers": [],
                        }
                    ],
                    "discount": None,
                    "rates": {"service_bps": 500, "tax_bps": 1_000},
                    "totals": {
                        "subtotal": subtotal,
                        "discount_amount": 0,
                        "service_charge": service,
                        "tax": tax,
                        "total": total,
                    },
                    "payments": [
                        {
                            "id": new_ulid(),
                            "payment_method_id": cash,
                            "method_type": "cash",
                            "amount": total,
                            "reference": None,
                        }
                    ],
                    "change_amount": 0,
                },
            }
        )
    cash_sales = sum(e["payload"]["totals"]["total"] for e in events[1:])
    events.append(
        {
            "id": new_ulid(),
            "type": "shift.closed",
            "aggregate_id": shift,
            "occurred_at": at(ORDERS_PER_DEVICE * 3 + 5),
            "payload": {
                "closed_by": cashier,
                "counted_cash": 200_000 + cash_sales,
                "expected_cash": 200_000 + cash_sales,
                "variance": 0,
            },
        }
    )
    return events


async def push_all(api: AsyncClient, token: str, events: list[dict[str, Any]]) -> list[str]:
    statuses: list[str] = []
    for i in range(0, len(events), 50):
        response = await push(api, token, events[i : i + 50])
        assert response.status_code == 200, response.text
        statuses += [r["status"] for r in response.json()["data"]["results"]]
    return statuses


async def test_two_devices_sync_a_day_offline_without_duplicates(
    api: AsyncClient, system_engine: AsyncEngine
) -> None:
    s = await outlet_with_menu_and_device(api)
    token_b, code_b = await second_device(api, s.outlet_id)
    day_a = day_of_sales("A", s.ids["siti"], s.ids["product"], s.ids["cash"])
    day_b = day_of_sales(code_b, s.ids["siti"], s.ids["product"], s.ids["cash"])

    # Both devices come back online at the same time; device A's first batch is sent twice
    # (the response was lost), device B pushes its whole day again after finishing.
    first_a, first_b, lost_response = await asyncio.gather(
        push_all(api, s.device_token, day_a),
        push_all(api, token_b, day_b),
        push_all(api, s.device_token, day_a[:50]),
    )
    replay_b = await push_all(api, token_b, day_b)

    assert first_b == ["accepted"] * len(day_b)
    assert sorted(set(first_a + lost_response)) == ["accepted", "duplicate"]
    assert (first_a + lost_response).count("accepted") == len(day_a)
    assert replay_b == ["duplicate"] * len(day_b)
    async with system_engine.begin() as conn:
        orders, receipts, events = (
            await conn.execute(
                text(
                    "SELECT count(*), count(DISTINCT receipt_no),"
                    " (SELECT count(*) FROM sync_events) FROM orders"
                )
            )
        ).one()
        closed = (
            await conn.execute(text("SELECT count(*) FROM shifts WHERE status = 'closed'"))
        ).scalar_one()
    assert (orders, receipts) == (2 * ORDERS_PER_DEVICE, 2 * ORDERS_PER_DEVICE)
    assert events == len(day_a) + len(day_b)
    assert closed == 2
