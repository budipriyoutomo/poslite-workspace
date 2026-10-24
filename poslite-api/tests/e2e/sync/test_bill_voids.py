"""ADR-028 end to end: items cancelled from an open bill after the kitchen had them are pushed,
counted as pre-payment voids in the daily report, and listed for the back-office — without
changing sales."""

import json
from pathlib import Path
from typing import Any

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine

from ..identity.helpers import bearer
from ..reporting.test_sales_summary import summary
from .helpers import Setup, outlet_with_menu_and_device
from .test_corrections import _relay
from .test_push import batch, push, scalar, statuses

BILL_VOIDS = (Path(__file__).parents[2] / "fixtures" / "bill-void-events.json").read_text()
DAY = "from=2026-09-25&to=2026-09-25"


def bill_voids(s: Setup) -> list[dict[str, Any]]:
    raw = BILL_VOIDS.replace("01K5ZA00000000000000000001", s.ids["siti"])
    raw = raw.replace("01K5ZA00000000000000000002", s.ids["owner"])
    raw = raw.replace("01K5ZP00000000000000000001", s.ids["product"])
    events: list[dict[str, Any]] = json.loads(raw)
    return events


async def _pushed(api: AsyncClient, app_engine: AsyncEngine, system_engine: AsyncEngine) -> Setup:
    s = await outlet_with_menu_and_device(api)
    *sale, closed = batch(s)
    response = await push(api, s.device_token, [*sale, *bill_voids(s), closed])
    assert statuses(response) == ["accepted"] * 6
    await _relay(app_engine, system_engine)
    return s


async def test_pre_payment_voids_reach_the_daily_report_without_changing_sales(
    api: AsyncClient, app_engine: AsyncEngine, system_engine: AsyncEngine
) -> None:
    s = await _pushed(api, app_engine, system_engine)

    data = await summary(api, s.owner_token, f"outlet_id={s.outlet_id}&{DAY}")

    totals = data["totals"]
    assert (totals["net"], totals["order_count"]) == (72_765, 1)
    assert (totals["pre_payment_void_count"], totals["pre_payment_void_amount"]) == (2, 93_000)


async def test_a_replayed_bill_void_is_kept_once(
    api: AsyncClient, app_engine: AsyncEngine, system_engine: AsyncEngine
) -> None:
    s = await _pushed(api, app_engine, system_engine)

    again = await push(api, s.device_token, bill_voids(s))

    assert statuses(again) == ["duplicate", "duplicate"]
    assert await scalar(system_engine, "SELECT count(*) FROM bill_voids") == 2


async def test_back_office_lists_who_cancelled_what_and_who_approved(
    api: AsyncClient, app_engine: AsyncEngine, system_engine: AsyncEngine
) -> None:
    s = await _pushed(api, app_engine, system_engine)

    response = await api.get(
        f"/api/v1/reports/bill-voids?outlet_id={s.outlet_id}&{DAY}", headers=bearer(s.owner_token)
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["totals"] == {"count": 2, "amount": 93_000}
    cancelled = data["voids"][0]  # newest first
    assert (cancelled["scope"], cancelled["table_label"], cancelled["reason"]) == (
        "bill_cancelled",
        "B1",
        "Salah input",
    )
    assert (cancelled["cashier_id"], cancelled["approved_by"]) == (s.ids["siti"], s.ids["owner"])
    assert (cancelled["cashier_name"], cancelled["approver_name"]) == ("Siti", "Budi")
    assert [(x["product_name"], x["quantity"], x["amount"]) for x in cancelled["lines"]] == [
        ("Nasi Gudeg", 2, 50_000),
        ("Es Teh", 1, 8_000),
    ]
    assert data["voids"][1]["lines"][0]["modifiers"] == ["Tambah Ayam"]


async def test_another_company_never_sees_the_voids(
    api: AsyncClient, app_engine: AsyncEngine, system_engine: AsyncEngine
) -> None:
    s = await _pushed(api, app_engine, system_engine)
    other = await outlet_with_menu_and_device(
        api, email="lain@resto.id", slug="resto-lain", outlet={"code": "BDG01", "name": "Dago"}
    )

    own = await api.get(f"/api/v1/reports/bill-voids?{DAY}", headers=bearer(other.owner_token))
    foreign = await api.get(
        f"/api/v1/reports/bill-voids?outlet_id={s.outlet_id}&{DAY}",
        headers=bearer(other.owner_token),
    )

    assert own.json()["data"]["voids"] == []
    assert foreign.status_code == 404


async def test_a_day_with_only_cancelled_bills_is_still_reported(
    api: AsyncClient, app_engine: AsyncEngine, system_engine: AsyncEngine
) -> None:
    s = await outlet_with_menu_and_device(api)
    opened = batch(s)[0]
    assert statuses(await push(api, s.device_token, [opened, *bill_voids(s)])) == ["accepted"] * 3
    await _relay(app_engine, system_engine)

    data = await summary(api, s.owner_token, f"outlet_id={s.outlet_id}&{DAY}")

    assert (data["totals"]["order_count"], data["totals"]["pre_payment_void_amount"]) == (0, 93_000)


async def test_the_day_closing_snapshot_counts_the_pre_payment_voids(
    api: AsyncClient, app_engine: AsyncEngine, system_engine: AsyncEngine
) -> None:
    s = await _pushed(api, app_engine, system_engine)

    response = await api.get(
        f"/api/v1/day-closings/day?outlet_id={s.outlet_id}&business_date=2026-09-25",
        headers=bearer(s.owner_token),
    )

    totals = response.json()["data"]["current"]["totals"]
    assert (totals["pre_payment_void_count"], totals["pre_payment_void_amount"]) == (2, 93_000)
