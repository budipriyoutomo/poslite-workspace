from typing import Any

from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from poslite.worker import relay_job

from ..identity.helpers import bearer
from ..sync.helpers import Setup, outlet_with_menu_and_device
from ..sync.test_push import batch, push

DAY = "2026-09-25"
CLOSED_SHIFT_CASH = {
    "shift_count": 1,
    "open_shift_count": 0,
    "opening_cash": 200_000,
    "expected_cash": 252_765,
    "counted_cash": 250_000,
    "variance": -2_765,
}


async def project(app_engine: AsyncEngine, system_engine: AsyncEngine) -> None:
    await relay_job(
        {
            "app_sessions": async_sessionmaker(app_engine),
            "system_sessions": async_sessionmaker(system_engine),
        }
    )


async def day(api: AsyncClient, s: Setup, business_date: str = DAY) -> Any:
    response = await api.get(
        f"/api/v1/day-closings/day?outlet_id={s.outlet_id}&business_date={business_date}",
        headers=bearer(s.owner_token),
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


async def close(api: AsyncClient, s: Setup, business_date: str = DAY, notes: str = "") -> Response:
    return await api.post(
        "/api/v1/day-closings",
        json={"outlet_id": s.outlet_id, "business_date": business_date, "notes": notes},
        headers=bearer(s.owner_token),
    )


async def test_shows_the_days_sales_cash_and_no_closing_yet(
    api: AsyncClient, app_engine: AsyncEngine, system_engine: AsyncEngine
) -> None:
    s = await outlet_with_menu_and_device(api)
    await push(api, s.device_token, batch(s))
    await project(app_engine, system_engine)

    data = await day(api, s)

    assert (data["day_ended"], data["closing"], data["changed_since_close"]) == (True, None, False)
    assert data["current"]["totals"]["net"] == 72_765
    assert data["current"]["payment_methods"][0]["amount"] == 72_765
    assert data["current"]["cash"] == CLOSED_SHIFT_CASH
    assert data["current"]["warnings"] == []


async def test_closes_a_day_once_and_keeps_its_snapshot(
    api: AsyncClient, app_engine: AsyncEngine, system_engine: AsyncEngine
) -> None:
    s = await outlet_with_menu_and_device(api)
    await push(api, s.device_token, batch(s))
    await project(app_engine, system_engine)

    created = await close(api, s, notes="Setoran ke bank")
    again = await close(api, s)
    data = await day(api, s)

    assert created.status_code == 201, created.text
    closing = created.json()["data"]
    assert (closing["business_date"], closing["notes"]) == (DAY, "Setoran ke bank")
    assert closing["closed_by"] == s.ids["owner"]
    assert closing["snapshot"]["cash"] == CLOSED_SHIFT_CASH
    assert (again.status_code, again.json()["code"]) == (409, "DAY_ALREADY_CLOSED")
    assert data["closing"]["id"] == closing["id"]
    assert data["closing"]["snapshot"] == data["current"]
    assert data["changed_since_close"] is False


async def test_refuses_to_close_a_day_that_has_not_ended(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    response = await close(api, s, business_date="2099-01-01")

    assert (response.status_code, response.json()["code"]) == (422, "DAY_NOT_ENDED")
    assert (await day(api, s, "2099-01-01"))["day_ended"] is False


async def test_records_open_shifts_as_a_warning_without_blocking(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    opened, *_ = batch(s)
    await push(api, s.device_token, [opened])

    response = await close(api, s)

    assert response.status_code == 201, response.text
    snapshot = response.json()["data"]["snapshot"]
    assert snapshot["warnings"] == [{"code": "OPEN_SHIFTS", "count": 1, "devices": None}]
    assert snapshot["cash"]["open_shift_count"] == 1


async def test_sales_synced_after_closing_are_kept_and_shown_as_a_change(
    api: AsyncClient, app_engine: AsyncEngine, system_engine: AsyncEngine
) -> None:
    s = await outlet_with_menu_and_device(api)
    events = batch(s)
    await push(api, s.device_token, events[:1])
    assert (await close(api, s)).status_code == 201

    await push(api, s.device_token, events[1:])
    await project(app_engine, system_engine)
    data = await day(api, s)

    assert data["closing"]["snapshot"]["totals"]["net"] == 0
    assert data["current"]["totals"]["net"] == 72_765
    assert data["changed_since_close"] is True


async def test_lists_the_outlets_closings_in_a_date_range(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    await close(api, s, business_date="2026-09-24")
    await close(api, s, business_date="2026-09-25")

    response = await api.get(
        f"/api/v1/day-closings?outlet_id={s.outlet_id}&from=2026-09-25&to=2026-09-30",
        headers=bearer(s.owner_token),
    )

    assert response.status_code == 200, response.text
    rows = response.json()["data"]
    assert [r["business_date"] for r in rows] == ["2026-09-25"]
    assert rows[0]["closed_by_name"]
    assert "snapshot" not in rows[0]


async def test_another_company_cannot_see_or_close_the_outlets_day(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    other = await outlet_with_menu_and_device(api, email="lain@resto.id", slug="resto-lain")
    intruder = Setup(**{**s.__dict__, "owner_token": other.owner_token})

    seen = await api.get(
        f"/api/v1/day-closings/day?outlet_id={s.outlet_id}&business_date={DAY}",
        headers=bearer(other.owner_token),
    )
    closed = await close(api, intruder)

    assert (seen.status_code, seen.json()["code"]) == (404, "OUTLET_NOT_FOUND")
    assert (closed.status_code, closed.json()["code"]) == (404, "OUTLET_NOT_FOUND")


async def test_a_device_token_cannot_close_a_day(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    device = Setup(**{**s.__dict__, "owner_token": s.device_token})

    response = await close(api, device)

    assert response.status_code == 403
