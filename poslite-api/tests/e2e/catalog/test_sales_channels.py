"""ADR-029: sales channels are brand master data. Every brand starts with Dine In and Take Away;
the owner adds delivery channels with a markup or their own price list; devices pull them."""

from typing import Any

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine

from ..identity.helpers import bearer
from ..organization.brands import as_user, company_with_two_brands
from ..sync.helpers import Setup, outlet_with_menu_and_device, pull

GOFOOD = {
    "code": "GOFOOD",
    "name": "GoFood",
    "kind": "delivery",
    "price_mode": "markup_bps",
    "markup_bps": 2000,
    "markup_rounding_unit": 500,
    "default_payment_method_id": None,
    "applies_service": False,
    "applies_tax": True,
    "requires_external_ref": True,
    "is_active": True,
    "sort_order": 3,
}


async def _create(api: AsyncClient, s: Setup, **body: Any) -> Any:
    return await api.post(
        "/api/v1/sales-channels", json={**GOFOOD, **body}, headers=bearer(s.owner_token)
    )


async def _channels(api: AsyncClient, s: Setup) -> list[dict[str, Any]]:
    response = await api.get("/api/v1/sales-channels", headers=bearer(s.owner_token))
    assert response.status_code == 200, response.text
    data: list[dict[str, Any]] = response.json()["data"]
    return data


def _pulled(page: dict[str, Any]) -> list[dict[str, Any]]:
    return [c for c in page["changes"] if c["entity"] == "sales_channel"]


async def test_a_new_brand_starts_with_dine_in_and_take_away(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    channels = await _channels(api, s)

    assert [(c["code"], c["name"], c["kind"], c["price_mode"]) for c in channels] == [
        ("DINE_IN", "Dine In", "dine_in", "base"),
        ("TAKE_AWAY", "Take Away", "take_away", "base"),
    ]
    assert all(c["applies_service"] and c["applies_tax"] for c in channels)


async def test_the_owner_adds_a_delivery_channel_with_a_markup(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    created = await _create(api, s, default_payment_method_id=s.ids["qris"])

    assert created.status_code == 201, created.text
    channel = created.json()["data"]
    assert channel | {"id": "", "prices": []} == {
        **GOFOOD,
        "default_payment_method_id": s.ids["qris"],
        "id": "",
        "prices": [],
    }
    assert [c["code"] for c in await _channels(api, s)] == ["DINE_IN", "TAKE_AWAY", "GOFOOD"]


async def test_a_channel_code_is_unique_in_the_brand(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    await _create(api, s)

    again = await _create(api, s, code="gofood", name="GoFood 2")

    assert (again.status_code, again.json()["code"]) == (409, "CHANNEL_CODE_TAKEN")


async def test_a_markup_needs_a_rounding_unit_and_a_price_list_needs_no_markup(
    api: AsyncClient,
) -> None:
    s = await outlet_with_menu_and_device(api)

    no_unit = await _create(api, s, markup_rounding_unit=0)
    stray_markup = await _create(api, s, code="GRAB", price_mode="price_list", markup_bps=1000)

    assert (no_unit.status_code, stray_markup.status_code) == (422, 422)


async def test_a_price_list_channel_gets_its_own_prices(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    channel = (await _create(api, s, code="SHOPEE", price_mode="price_list", markup_bps=0)).json()[
        "data"
    ]

    response = await api.put(
        f"/api/v1/sales-channels/{channel['id']}/prices",
        json={"prices": [{"product_id": s.ids["product"], "price": 7000}]},
        headers=bearer(s.owner_token),
    )

    assert response.status_code == 200, response.text
    assert response.json()["data"]["prices"] == [{"product_id": s.ids["product"], "price": 7000}]


async def test_a_price_for_a_product_of_another_brand_is_refused(
    api: AsyncClient, app_engine: AsyncEngine
) -> None:
    company = await company_with_two_brands(api, app_engine)
    brand_a, brand_b = company.brand_a, company.brand_b
    category_b = (
        await api.post(
            "/api/v1/categories", json={"name": "Mie"}, headers=as_user(company.owner, brand_b)
        )
    ).json()["data"]["id"]
    product_b = (
        await api.post(
            "/api/v1/products",
            json={"category_id": category_b, "sku": "B-1", "name": "Ramen", "price": 30000},
            headers=as_user(company.owner, brand_b),
        )
    ).json()["data"]["id"]
    channel = (
        await api.post(
            "/api/v1/sales-channels",
            json={**GOFOOD, "price_mode": "price_list", "markup_bps": 0},
            headers=as_user(company.owner, brand_a),
        )
    ).json()["data"]

    response = await api.put(
        f"/api/v1/sales-channels/{channel['id']}/prices",
        json={"prices": [{"product_id": product_b, "price": 1000}]},
        headers=as_user(company.owner, brand_a),
    )

    assert (response.status_code, response.json()["code"]) == (422, "CROSS_BRAND_REFERENCE")


async def test_devices_pull_active_channels_with_their_prices(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    channel = (await _create(api, s, code="SHOPEE", price_mode="price_list", markup_bps=0)).json()[
        "data"
    ]
    await api.put(
        f"/api/v1/sales-channels/{channel['id']}/prices",
        json={"prices": [{"product_id": s.ids["product"], "price": 7000}]},
        headers=bearer(s.owner_token),
    )

    pulled = {c["id"]: c for c in _pulled(await pull(api, s.device_token))}

    assert len(pulled) == 3
    assert pulled[channel["id"]]["data"]["prices"] == [
        {"product_id": s.ids["product"], "price": 7000}
    ]
    assert "is_active" not in pulled[channel["id"]]["data"]


async def test_a_switched_off_channel_leaves_the_device(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    channel = (await _create(api, s)).json()["data"]
    cursor = (await pull(api, s.device_token))["next_cursor"]

    await api.put(
        f"/api/v1/sales-channels/{channel['id']}",
        json={**GOFOOD, "is_active": False},
        headers=bearer(s.owner_token),
    )

    changes = _pulled(await pull(api, s.device_token, cursor=cursor))
    assert [(c["id"], c["op"]) for c in changes] == [(channel["id"], "delete")]


async def test_a_deleted_channel_is_gone_from_the_list(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    channel = (await _create(api, s)).json()["data"]

    deleted = await api.delete(
        f"/api/v1/sales-channels/{channel['id']}", headers=bearer(s.owner_token)
    )

    assert deleted.status_code == 200
    assert [c["code"] for c in await _channels(api, s)] == ["DINE_IN", "TAKE_AWAY"]
