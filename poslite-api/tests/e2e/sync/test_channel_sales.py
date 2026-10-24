"""ADR-029 end to end: a sale on a delivery channel is pushed, stored on that channel with the
app's order number, and the daily report breaks sales down per channel."""

import copy
from typing import Any

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine

from ..identity.helpers import bearer
from ..reporting.test_sales_summary import summary
from .helpers import Setup, outlet_with_menu_and_device
from .test_corrections import _relay
from .test_push import batch, push

DAY = "from=2026-09-25&to=2026-09-25"


async def _gofood(api: AsyncClient, s: Setup) -> str:
    response = await api.post(
        "/api/v1/sales-channels",
        json={
            "code": "GOFOOD",
            "name": "GoFood",
            "kind": "delivery",
            "applies_service": False,
            "requires_external_ref": True,
        },
        headers=bearer(s.owner_token),
    )
    assert response.status_code == 201, response.text
    channel_id: str = response.json()["data"]["id"]
    return channel_id


def _on_gofood(s: Setup, channel_id: str) -> list[dict[str, Any]]:
    """The fixture sale (70.000 gross, 10% off) on GoFood: no service, PB1 10% → 69.300."""
    opened, _, placed, _ = batch(s)
    order = copy.deepcopy(placed)
    p = order["payload"]
    p["channel_id"], p["external_ref"] = channel_id, "GF-881234"
    p["rates"] = {"service_bps": 0, "tax_bps": 1000}
    p["totals"] = {
        "subtotal": 70_000,
        "discount_amount": 7_000,
        "service_charge": 0,
        "tax": 6_300,
        "total": 69_300,
    }
    p["change_amount"] = 100_000 - 69_300
    return [opened, order]


async def _channels(api: AsyncClient, s: Setup) -> dict[str, str]:
    listed = (await api.get("/api/v1/sales-channels", headers=bearer(s.owner_token))).json()
    return {c["code"]: c["id"] for c in listed["data"]}


async def test_a_delivery_sale_is_stored_on_its_channel_without_flags(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    events = _on_gofood(s, await _gofood(api, s))

    results = (await push(api, s.device_token, events)).json()["data"]["results"]

    assert [(r["status"], r.get("flags") or []) for r in results] == [("accepted", [])] * 2
    order = (
        await api.get(f"/api/v1/orders/{events[1]['aggregate_id']}", headers=bearer(s.owner_token))
    ).json()["data"]
    assert (order["channel_id"], order["external_ref"]) == (
        events[1]["payload"]["channel_id"],
        "GF-881234",
    )


async def test_a_sale_from_an_older_device_is_put_on_take_away(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    opened, _, placed, _ = batch(s)  # no channel_id: a device from before channels

    await push(api, s.device_token, [opened, placed])

    order = (
        await api.get(f"/api/v1/orders/{placed['aggregate_id']}", headers=bearer(s.owner_token))
    ).json()["data"]
    assert order["channel_id"] == (await _channels(api, s))["TAKE_AWAY"]


async def test_the_daily_report_breaks_sales_down_per_channel(
    api: AsyncClient, app_engine: AsyncEngine, system_engine: AsyncEngine
) -> None:
    s = await outlet_with_menu_and_device(api)
    on_gofood = _on_gofood(s, await _gofood(api, s))
    _, _, take_away, closed = batch(s)
    take_away = copy.deepcopy(take_away)
    take_away["id"], take_away["aggregate_id"] = (
        "01K5ZE00000000000000000099",
        "01K5ZR00000000000000000099",
    )
    take_away["payload"]["receipt_no"] = "JKT01A-260925-0099"
    take_away["payload"]["lines"][0]["id"] = "01K5ZN00000000000000000099"
    take_away["payload"]["payments"][0]["id"] = "01K5ZY10000000000000000099"
    await push(api, s.device_token, [*on_gofood, take_away, closed])
    await _relay(app_engine, system_engine)

    channels = (await summary(api, s.owner_token, f"outlet_id={s.outlet_id}&{DAY}"))["channels"]

    assert [(c["channel_name"], c["kind"], c["order_count"], c["net"]) for c in channels] == [
        ("Take Away", "take_away", 1, 72_765),
        ("GoFood", "delivery", 1, 69_300),
    ]


async def test_a_take_away_sale_keeps_its_queue_number_and_guest(api: AsyncClient) -> None:
    """P1-1: the number called out at the counter and the guest's name reach the server."""
    s = await outlet_with_menu_and_device(api)
    opened, _, placed, _ = batch(s)
    order = copy.deepcopy(placed)
    order["payload"] |= {"queue_no": "A-012", "customer_name": "Andi"}

    results = (await push(api, s.device_token, [opened, order])).json()["data"]["results"]

    assert [r["status"] for r in results] == ["accepted", "accepted"]
    detail = (
        await api.get(f"/api/v1/orders/{order['aggregate_id']}", headers=bearer(s.owner_token))
    ).json()["data"]
    assert (detail["queue_no"], detail["customer_name"]) == ("A-012", "Andi")
