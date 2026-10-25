"""P1-3 end to end: an outlet rounds the cash part of a sale. The device sends the rule it sold
with and the rounding; the server checks it with the same rule, keeps the total, and reports the
rounding per day."""

import copy
from typing import Any

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine

from ..identity.helpers import bearer
from ..reporting.test_sales_summary import summary
from .helpers import Setup, outlet_with_menu_and_device, pull
from .test_corrections import _relay
from .test_open_bills import SETTINGS
from .test_push import batch, push

DAY = "from=2026-09-25&to=2026-09-25"


def _rounded(s: Setup, amount: int, cash: int) -> list[dict[str, Any]]:
    """The fixture sale (total 72.765) paid in cash with rounding to 100."""
    opened, _, placed, _ = batch(s)
    order = copy.deepcopy(placed)
    p = order["payload"]
    p["cash_rounding"] = {"unit": 100, "mode": "nearest", "amount": amount}
    p["payments"][0]["amount"] = cash
    p["change_amount"] = cash - 72_765 - amount
    return [opened, order]


async def test_the_outlet_setting_reaches_the_device(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    saved = await api.put(
        f"/api/v1/outlets/{s.outlet_id}",
        json={**SETTINGS, "cash_rounding_unit": 500, "cash_rounding_mode": "down"},
        headers=bearer(s.owner_token),
    )

    assert saved.status_code == 200, saved.text
    changes = (await pull(api, s.device_token))["changes"]
    setting = next(c for c in changes if c["entity"] == "outlet_setting")["data"]
    assert (setting["cash_rounding_unit"], setting["cash_rounding_mode"]) == (500, "down")


async def test_an_outlet_rounds_only_to_100_500_or_1000(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    refused = await api.put(
        f"/api/v1/outlets/{s.outlet_id}",
        json={**SETTINGS, "cash_rounding_unit": 250},
        headers=bearer(s.owner_token),
    )

    assert refused.status_code == 422


async def test_a_rounded_cash_sale_keeps_its_total_and_is_reported(
    api: AsyncClient, app_engine: AsyncEngine, system_engine: AsyncEngine
) -> None:
    s = await outlet_with_menu_and_device(api)
    events = _rounded(s, amount=35, cash=72_800)

    results = (await push(api, s.device_token, events)).json()["data"]["results"]
    await _relay(app_engine, system_engine)

    assert [(r["status"], r.get("flags") or []) for r in results] == [("accepted", [])] * 2
    order = (
        await api.get(f"/api/v1/orders/{events[1]['aggregate_id']}", headers=bearer(s.owner_token))
    ).json()["data"]
    assert (order["total"], order["rounding_amount"]) == (72_765, 35)
    totals = (await summary(api, s.owner_token, f"outlet_id={s.outlet_id}&{DAY}"))["totals"]
    assert (totals["net"], totals["cash_rounding"]) == (72_765, 35)


async def test_cash_below_the_total_is_enough_when_it_rounds_down(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    events = _rounded(s, amount=-65, cash=72_700)  # 72.765 down to 100
    events[1]["payload"]["cash_rounding"]["mode"] = "down"

    results = (await push(api, s.device_token, events)).json()["data"]["results"]

    assert [(r["status"], r.get("flags") or []) for r in results] == [("accepted", [])] * 2


async def test_a_rounding_that_breaks_the_rule_is_kept_and_flagged(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    events = _rounded(s, amount=235, cash=73_000)

    results = (await push(api, s.device_token, events)).json()["data"]["results"]

    assert (results[1]["status"], results[1]["flags"]) == ("flagged", ["ROUNDING_MISMATCH"])
