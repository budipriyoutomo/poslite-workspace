"""ADR-030: a brand whose menu prices already include service and PB1. The device sends the
flag with the rates snapshot (ADR-011); the server recomputes with it and reports the split."""

import copy
from typing import Any

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine

from ..identity.helpers import bearer
from ..reporting.test_sales_summary import summary
from .helpers import Setup, outlet_with_menu_and_device, pull
from .test_corrections import _relay
from .test_push import batch, push

# The fixture sale (70.000 gross, 10% off) at a brand with prices that include tax:
# the guest pays 63.000; PB1 10% and service 5% are inside it.
INCLUSIVE_TOTALS = {
    "subtotal": 70_000,
    "discount_amount": 7_000,
    "service_charge": 2_727,
    "tax": 5_727,
    "total": 63_000,
}


async def _set_inclusive(api: AsyncClient, s: Setup, value: bool) -> None:
    response = await api.put(
        f"/api/v1/brands/{s.brand_id}",
        json={"code": "MAHARASA", "name": "Warung Maharasa", "price_includes_tax": value},
        headers=bearer(s.owner_token),
    )
    assert response.status_code == 200, response.text


def _inclusive_sale(s: Setup) -> list[dict[str, Any]]:
    opened, _, placed, _ = batch(s)
    order = copy.deepcopy(placed)
    order["payload"]["rates"]["includes_tax"] = True
    order["payload"]["totals"] = INCLUSIVE_TOTALS
    order["payload"]["change_amount"] = 100_000 - 63_000
    return [opened, order]


async def _outlet_setting(api: AsyncClient, s: Setup) -> dict[str, Any]:
    changes = (await pull(api, s.device_token))["changes"]
    setting: dict[str, Any] = next(c for c in changes if c["entity"] == "outlet_setting")["data"]
    return setting


async def test_a_brand_starts_with_prices_before_tax(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    brands = (await api.get("/api/v1/brands", headers=bearer(s.owner_token))).json()["data"]

    assert brands[0]["price_includes_tax"] is False
    assert (await _outlet_setting(api, s))["price_includes_tax"] is False


async def test_the_brand_setting_reaches_the_device(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    await _set_inclusive(api, s, True)

    brands = (await api.get("/api/v1/brands", headers=bearer(s.owner_token))).json()["data"]
    assert brands[0]["price_includes_tax"] is True
    assert (await _outlet_setting(api, s))["price_includes_tax"] is True


async def test_an_inclusive_sale_is_accepted_and_reported_at_the_price_paid(
    api: AsyncClient, app_engine: AsyncEngine, system_engine: AsyncEngine
) -> None:
    s = await outlet_with_menu_and_device(api)
    await _set_inclusive(api, s, True)
    events = _inclusive_sale(s)

    results = (await push(api, s.device_token, events)).json()["data"]["results"]
    await _relay(app_engine, system_engine)

    assert [(r["status"], r.get("flags") or []) for r in results] == [("accepted", [])] * 2
    totals = (
        await summary(api, s.owner_token, f"outlet_id={s.outlet_id}&from=2026-09-25&to=2026-09-25")
    )["totals"]
    assert (totals["net"], totals["service"], totals["tax"]) == (63_000, 2_727, 5_727)
    order = (
        await api.get(f"/api/v1/orders/{events[1]['aggregate_id']}", headers=bearer(s.owner_token))
    ).json()["data"]
    assert order["price_includes_tax"] is True


async def test_a_sale_priced_in_the_other_mode_is_kept_and_flagged(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    await _set_inclusive(api, s, True)
    opened, _, placed, _ = batch(s)  # priced before tax by a device that has not pulled yet

    results = (await push(api, s.device_token, [opened, placed])).json()["data"]["results"]

    assert (results[1]["status"], results[1]["flags"]) == ("flagged", ["RATES_OUTDATED"])
