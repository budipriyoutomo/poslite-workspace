import asyncio
import json
from pathlib import Path
from typing import Any

from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from ..identity.helpers import bearer
from .helpers import Setup, outlet_with_menu_and_device

FIXTURE: list[dict[str, Any]] = json.loads(
    (Path(__file__).parents[2] / "fixtures" / "sync-events.json").read_text()
)


def batch(s: Setup) -> list[dict[str, Any]]:
    """The shared fixture events, re-pointed at this test's cashier, product and payment method."""
    raw = json.dumps(FIXTURE)
    raw = raw.replace("01K5ZA00000000000000000001", s.ids["siti"])
    raw = raw.replace("01K5ZP00000000000000000001", s.ids["product"]).replace(
        "01K5ZY00000000000000000001", s.ids["cash"]
    )
    events: list[dict[str, Any]] = json.loads(raw)
    return events


async def push(api: AsyncClient, token: str, events: list[dict[str, Any]]) -> Any:
    return await api.post("/api/v1/sync/push", json={"events": events}, headers=bearer(token))


def statuses(response: Any) -> list[str]:
    assert response.status_code == 200, response.text
    return [r["status"] for r in response.json()["data"]["results"]]


async def scalar(engine: AsyncEngine, sql: str) -> Any:
    async with engine.begin() as conn:
        return (await conn.execute(text(sql))).scalar_one()


async def test_a_batch_is_stored_in_order(api: AsyncClient, system_engine: AsyncEngine) -> None:
    s = await outlet_with_menu_and_device(api)

    response = await push(api, s.device_token, batch(s))

    assert statuses(response) == ["accepted"] * 4
    assert await scalar(system_engine, "SELECT total FROM orders") == 72_765
    assert await scalar(system_engine, "SELECT count(*) FROM order_line_modifiers") == 1
    assert await scalar(system_engine, "SELECT status FROM shifts") == "closed"
    assert (
        await scalar(system_engine, "SELECT count(*) FROM outbox_messages") == 3
    )  # opened, placed, closed


async def test_pushing_the_same_batch_twice_creates_nothing_twice(
    api: AsyncClient, system_engine: AsyncEngine
) -> None:
    s = await outlet_with_menu_and_device(api)
    await push(api, s.device_token, batch(s))

    assert statuses(await push(api, s.device_token, batch(s))) == ["duplicate"] * 4
    assert await scalar(system_engine, "SELECT count(*) FROM orders") == 1


async def test_two_concurrent_pushes_from_one_device_do_not_double_insert(
    api: AsyncClient, system_engine: AsyncEngine
) -> None:
    s = await outlet_with_menu_and_device(api)

    first, second = await asyncio.gather(
        push(api, s.device_token, batch(s)), push(api, s.device_token, batch(s))
    )

    assert sorted([statuses(first), statuses(second)]) == [["accepted"] * 4, ["duplicate"] * 4]
    assert await scalar(system_engine, "SELECT count(*) FROM orders") == 1


async def test_a_rejected_event_can_be_pushed_again_after_the_cause_is_fixed(
    api: AsyncClient, system_engine: AsyncEngine
) -> None:
    s = await outlet_with_menu_and_device(api)
    events = batch(s)
    stranger = "01K5ZA00000000000000000099"
    events[0]["payload"]["opened_by"] = stranger  # not a cashier of this outlet (yet)

    first = await push(api, s.device_token, events[:1])
    assert first.json()["data"]["results"][0] | {"message": ""} == {
        "id": events[0]["id"],
        "status": "rejected",
        "code": "CASHIER_NOT_IN_OUTLET",
        "message": "",
    }

    events[0]["payload"]["opened_by"] = s.ids[
        "siti"
    ]  # the manager fixes it; the device re-sends the event
    assert statuses(await push(api, s.device_token, events[:1])) == ["accepted"]
    assert await scalar(system_engine, "SELECT attempts FROM sync_events") == 2


async def test_one_rejected_event_does_not_roll_back_the_rest_of_the_batch(
    api: AsyncClient, system_engine: AsyncEngine
) -> None:
    s = await outlet_with_menu_and_device(api)
    events = batch(s)
    events[1]["payload"]["amount"] = 0  # invalid cash movement

    assert statuses(await push(api, s.device_token, events)) == [
        "accepted",
        "rejected",
        "accepted",
        "accepted",
    ]
    assert await scalar(system_engine, "SELECT count(*) FROM cash_movements") == 0
    assert await scalar(system_engine, "SELECT count(*) FROM orders") == 1


async def test_totals_that_do_not_match_the_rates_snapshot_are_flagged_but_stored(
    api: AsyncClient, system_engine: AsyncEngine
) -> None:
    s = await outlet_with_menu_and_device(api)
    events = batch(s)
    events[2]["payload"]["totals"] |= {"tax": 6_000, "total": 72_150}
    events[2]["payload"]["change_amount"] = 27_850

    response = await push(api, s.device_token, events[:3])

    assert response.json()["data"]["results"][2] == {
        "id": events[2]["id"],
        "status": "flagged",
        "flags": ["TOTAL_MISMATCH"],
    }
    assert await scalar(system_engine, "SELECT flags FROM orders") == ["TOTAL_MISMATCH"]


async def test_a_revoked_device_is_unauthorized(
    api: AsyncClient, system_engine: AsyncEngine
) -> None:
    s = await outlet_with_menu_and_device(api)
    async with system_engine.begin() as conn:  # BYPASSRLS: stands in for the back-office revoke
        await conn.execute(text("UPDATE devices SET revoked_at = now()"))

    response = await push(api, s.device_token, batch(s))

    assert (response.status_code, response.json()["code"]) == (401, "DEVICE_REVOKED")


async def test_a_device_cannot_touch_another_tenants_shift(api: AsyncClient) -> None:
    a = await outlet_with_menu_and_device(api)
    b = await outlet_with_menu_and_device(
        api, slug="lain", email="b@b.id", outlet={"code": "BDG01", "name": "Bandung"}
    )
    await push(api, a.device_token, batch(a)[:1])  # tenant A opens shift S1

    close_a_shift = {**batch(b)[3]}  # tenant B's device tries to close A's shift id
    response = await push(api, b.device_token, [close_a_shift])

    assert response.json()["data"]["results"][0]["code"] == "SHIFT_NOT_FOUND"


async def test_limits_a_batch_to_50_events(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    response = await push(api, s.device_token, batch(s)[:1] * 51)

    assert response.status_code == 422


async def test_back_office_tokens_cannot_push(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    assert (await push(api, s.owner_token, batch(s))).status_code == 403
