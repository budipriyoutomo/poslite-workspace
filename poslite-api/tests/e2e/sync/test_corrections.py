"""ADR-023 end to end: a device voids and refunds offline, pushes, and the reports agree —
a void leaves the order's day, a refund is counted on the day it was paid out."""

import json
from pathlib import Path
from typing import Any

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from poslite.worker import relay_job

from ..identity.helpers import bearer
from ..reporting.test_sales_summary import summary
from .helpers import Setup, outlet_with_menu_and_device
from .test_push import batch, push, statuses

CORRECTIONS = (Path(__file__).parents[2] / "fixtures" / "correction-events.json").read_text()


def corrections(s: Setup) -> list[dict[str, Any]]:
    raw = CORRECTIONS.replace("01K5ZA00000000000000000001", s.ids["siti"])
    raw = raw.replace("01K5ZA00000000000000000002", s.ids["owner"])
    raw = raw.replace("01K5ZP00000000000000000001", s.ids["product"])
    raw = raw.replace("01K5ZY00000000000000000001", s.ids["cash"])
    events: list[dict[str, Any]] = json.loads(raw)
    return events


async def _relay(app_engine: AsyncEngine, system_engine: AsyncEngine) -> None:
    await relay_job(
        {
            "app_sessions": async_sessionmaker(app_engine),
            "system_sessions": async_sessionmaker(system_engine),
        }
    )


async def test_void_and_partial_refund_reach_the_reports(
    api: AsyncClient, app_engine: AsyncEngine, system_engine: AsyncEngine
) -> None:
    s = await outlet_with_menu_and_device(api)
    *sale, closed = batch(s)

    response = await push(api, s.device_token, [*sale, *corrections(s), closed])
    await _relay(app_engine, system_engine)

    assert statuses(response) == ["accepted"] * 7
    data = await summary(
        api, s.owner_token, f"outlet_id={s.outlet_id}&from=2026-09-25&to=2026-09-25"
    )
    assert {k: data["totals"][k] for k in ("net", "order_count", "void_count")} == {
        "net": 72_765,  # the voided second sale is not revenue
        "order_count": 1,
        "void_count": 1,
    }
    assert (data["totals"]["refund_amount"], data["totals"]["refund_count"]) == (36_383, 1)
    assert [(p["quantity"], p["refund_qty"], p["refund_amount"]) for p in data["products"]] == [
        (2, 1, 36_383)
    ]
    assert data["payment_methods"][0]["refund_amount"] == 36_383


async def test_a_refund_from_a_device_of_another_outlet_is_not_found(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    other = await outlet_with_menu_and_device(
        api, email="lain@resto.id", slug="resto-lain", outlet={"code": "BDG01", "name": "Dago"}
    )
    *sale, _ = batch(s)
    await push(api, s.device_token, sale)
    refund = corrections(s)[0]

    response = await push(api, other.device_token, [refund])

    assert response.json()["data"]["results"][0]["code"] == "ORDER_NOT_FOUND"


async def _pushed(api: AsyncClient) -> tuple[Setup, list[dict[str, Any]]]:
    s = await outlet_with_menu_and_device(api)
    *sale, closed = batch(s)
    events = corrections(s)
    assert statuses(await push(api, s.device_token, [*sale, *events, closed])) == ["accepted"] * 7
    return s, [*sale, *events]


async def test_back_office_sees_an_order_with_its_void_or_refunds(api: AsyncClient) -> None:
    s, events = await _pushed(api)
    sold, refund, voided_sale = events[2], events[3], events[4]

    refunded = (
        await api.get(f"/api/v1/orders/{sold['aggregate_id']}", headers=bearer(s.owner_token))
    ).json()["data"]
    voided = (
        await api.get(
            f"/api/v1/orders/{voided_sale['aggregate_id']}", headers=bearer(s.owner_token)
        )
    ).json()["data"]

    assert refunded["lines"][0]["refunded_quantity"] == 1
    assert [(r["id"], r["refund_no"], r["total"]) for r in refunded["refunds"]] == [
        (refund["aggregate_id"], "JKT01A-R260925-0001", 36_383)
    ]
    assert refunded["void"] is None
    assert (voided["status"], voided["void"]["reason"]) == ("voided", "Salah input")


async def test_a_device_looks_up_an_order_of_its_outlet_by_receipt_number(api: AsyncClient) -> None:
    s, _ = await _pushed(api)

    found = await api.get(
        "/api/v1/orders/lookup",
        params={"receipt_no": "JKT01A-260925-0001"},
        headers=bearer(s.device_token),
    )
    missing = await api.get(
        "/api/v1/orders/lookup",
        params={"receipt_no": "JKT01A-260925-9999"},
        headers=bearer(s.device_token),
    )

    assert found.status_code == 200
    assert found.json()["data"]["lines"][0]["refunded_quantity"] == 1
    assert (missing.status_code, missing.json()["code"]) == (404, "ORDER_NOT_FOUND")


async def test_back_office_lists_refunds_of_an_outlet_day(api: AsyncClient) -> None:
    s, events = await _pushed(api)
    refund_id = events[3]["aggregate_id"]

    listed = await api.get(
        "/api/v1/refunds",
        params={"outlet_id": s.outlet_id, "business_date": "2026-09-25"},
        headers=bearer(s.owner_token),
    )
    detail = await api.get(f"/api/v1/refunds/{refund_id}", headers=bearer(s.owner_token))

    assert [(r["id"], r["total"], r["flags"]) for r in listed.json()["data"]] == [
        (refund_id, 36_383, [])
    ]
    assert detail.json()["data"]["lines"] == [
        {
            "order_line_id": events[2]["payload"]["lines"][0]["id"],
            "product_id": s.ids["product"],
            "product_name": "Nasi Gudeg",
            "quantity": 1,
            "amount": 36_383,
        }
    ]
    assert detail.json()["data"]["payments"][0]["method_name"] == "Tunai"
