from typing import Any

from httpx import AsyncClient

from ..identity.helpers import bearer
from ..sync.helpers import Setup, outlet_with_menu_and_device, pull

HAPPY_HOUR = {
    "name": "Happy hour minuman",
    "type": "percent_off",
    "percentage": 20,
    "buy_qty": None,
    "get_qty": None,
    "product_ids": [],
    "category_ids": [],
    "outlet_ids": [],
    "days_of_week": [1, 2, 3, 4, 5],
    "start_time": "14:00",
    "end_time": "17:00",
    "starts_on": None,
    "ends_on": None,
    "is_active": True,
}


async def _create(api: AsyncClient, s: Setup, **body: Any) -> Any:
    return await api.post(
        "/api/v1/promotions", json={**HAPPY_HOUR, **body}, headers=bearer(s.owner_token)
    )


def _promotions(page: dict[str, Any]) -> list[dict[str, Any]]:
    return [c for c in page["changes"] if c["entity"] == "promotion"]


async def test_creates_lists_updates_and_deletes_a_promotion(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    created = await _create(api, s, category_ids=[s.ids["category"]])
    assert created.status_code == 201, created.text
    promo = created.json()["data"]
    assert promo | {"id": ""} == {**HAPPY_HOUR, "category_ids": [s.ids["category"]], "id": ""}

    updated = await api.put(
        f"/api/v1/promotions/{promo['id']}",
        json={**HAPPY_HOUR, "percentage": 25},
        headers=bearer(s.owner_token),
    )
    assert updated.json()["data"]["percentage"] == 25

    await api.delete(f"/api/v1/promotions/{promo['id']}", headers=bearer(s.owner_token))
    listed = await api.get("/api/v1/promotions", headers=bearer(s.owner_token))
    assert listed.json()["data"] == []


async def test_buy_x_get_y_needs_quantities_and_a_scope(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    no_scope = await _create(api, s, type="buy_x_get_y", percentage=None, buy_qty=2, get_qty=1)
    no_qty = await _create(
        api, s, type="buy_x_get_y", percentage=None, product_ids=[s.ids["product"]]
    )
    ok = await _create(
        api,
        s,
        type="buy_x_get_y",
        percentage=None,
        buy_qty=2,
        get_qty=1,
        product_ids=[s.ids["product"]],
    )

    assert (no_scope.status_code, no_qty.status_code, ok.status_code) == (422, 422, 201)


async def test_percent_off_needs_a_percentage_from_1_to_100(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    assert (await _create(api, s, percentage=0)).status_code == 422
    assert (await _create(api, s, percentage=101)).status_code == 422
    assert (await _create(api, s, percentage=None)).status_code == 422


async def test_devices_pull_active_promotions_for_their_outlet(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    everywhere = (await _create(api, s)).json()["data"]
    await _create(api, s, name="Outlet lain", outlet_ids=["01K5ZO00000000000000000009"])
    await _create(api, s, name="Nonaktif", is_active=False)

    changes = _promotions(await pull(api, s.device_token))

    upserts = [c for c in changes if c["op"] == "upsert"]
    assert [c["id"] for c in upserts] == [everywhere["id"]]
    assert upserts[0]["data"] == {
        k: v for k, v in HAPPY_HOUR.items() if k not in ("outlet_ids", "is_active")
    }
    assert {c["op"] for c in changes if c["id"] != everywhere["id"]} == {"delete"}


async def test_deactivating_a_promotion_reaches_devices_as_a_delete(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    promo = (await _create(api, s)).json()["data"]
    cursor = (await pull(api, s.device_token))["next_cursor"]

    await api.put(
        f"/api/v1/promotions/{promo['id']}",
        json={**HAPPY_HOUR, "is_active": False},
        headers=bearer(s.owner_token),
    )

    changes = _promotions(await pull(api, s.device_token, cursor))
    assert [(c["id"], c["op"]) for c in changes] == [(promo["id"], "delete")]
