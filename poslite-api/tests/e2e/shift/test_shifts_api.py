from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine

from ..identity.helpers import bearer
from ..organization.brands import as_user, company_with_two_brands
from ..sync.helpers import outlet_with_menu_and_device
from ..sync.test_push import batch, push

SHIFT = "01K5ZS00000000000000000001"


async def test_lists_the_shifts_of_an_outlet_and_business_day(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    await push(api, s.device_token, batch(s))

    response = await api.get(
        f"/api/v1/shifts?outlet_id={s.outlet_id}&business_date=2026-09-25",
        headers=bearer(s.owner_token),
    )
    other_day = await api.get(
        f"/api/v1/shifts?outlet_id={s.outlet_id}&business_date=2026-09-26",
        headers=bearer(s.owner_token),
    )

    assert response.status_code == 200, response.text
    assert response.json()["data"] == [
        {
            "id": SHIFT,
            "device_id": s.device_id,
            "device_name": "Kasir 1",
            "business_date": "2026-09-25",
            "status": "closed",
            "opened_by": s.ids["siti"],
            "opened_by_name": "Siti",
            "opened_at": "2026-09-25T01:00:00Z",
            "opening_cash": 200_000,
            "closed_by": s.ids["siti"],
            "closed_by_name": "Siti",
            "closed_at": "2026-09-25T14:00:00Z",
            "expected_cash": 252_765,
            "counted_cash": 250_000,
            "variance": -2_765,
        }
    ]
    assert other_day.json()["data"] == []


async def test_shift_detail_has_its_cash_movements(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    await push(api, s.device_token, batch(s))

    response = await api.get(f"/api/v1/shifts/{SHIFT}", headers=bearer(s.owner_token))

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["variance"] == -2_765
    assert [(m["type"], m["amount"], m["reason"]) for m in data["cash_movements"]] == [
        ("out", 20_000, "Beli es batu")
    ]


async def test_an_unknown_or_foreign_shift_is_not_found(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    other = await outlet_with_menu_and_device(api, email="lain@resto.id", slug="resto-lain")
    await push(api, s.device_token, batch(s))

    foreign = await api.get(f"/api/v1/shifts/{SHIFT}", headers=bearer(other.owner_token))

    assert (foreign.status_code, foreign.json()["code"]) == (404, "SHIFT_NOT_FOUND")


async def test_managers_of_another_brand_cannot_list_the_outlets_shifts(
    api: AsyncClient, app_engine: AsyncEngine
) -> None:
    company = await company_with_two_brands(api, app_engine)

    response = await api.get(
        f"/api/v1/shifts?outlet_id={company.outlet_a1}&business_date=2026-09-25",
        headers=as_user(company.brand_b_manager),
    )

    assert (response.status_code, response.json()["code"]) == (403, "OUTLET_FORBIDDEN")
