from httpx import AsyncClient

from ..identity.helpers import bearer
from ..sync.helpers import outlet_with_menu_and_device, pull


async def test_an_outlet_price_overrides_the_base_price_on_that_outlets_devices(
    api: AsyncClient,
) -> None:
    s = await outlet_with_menu_and_device(api)
    cursor = (await pull(api, s.device_token))["next_cursor"]

    response = await api.put(
        f"/api/v1/outlets/{s.outlet_id}/products/{s.ids['product']}",
        json={"price": 7_000, "is_available": True},
        headers=bearer(s.owner_token),
    )

    assert response.status_code == 200
    changes = (await pull(api, s.device_token, cursor))["changes"]
    assert [(c["entity"], c["data"]["price"]) for c in changes] == [("product", 7_000)]


async def test_an_outlet_can_mark_a_product_sold_out(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    await api.put(
        f"/api/v1/outlets/{s.outlet_id}/products/{s.ids['product']}",
        json={"price": None, "is_available": False},
        headers=bearer(s.owner_token),
    )

    product = next(
        c for c in (await pull(api, s.device_token))["changes"] if c["entity"] == "product"
    )
    assert (product["data"]["price"], product["data"]["is_available"]) == (5_000, False)


async def test_lists_outlet_prices_in_the_back_office(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    await api.put(
        f"/api/v1/outlets/{s.outlet_id}/products/{s.ids['product']}",
        json={"price": 7_000, "is_available": True},
        headers=bearer(s.owner_token),
    )

    response = await api.get(
        f"/api/v1/outlets/{s.outlet_id}/products", headers=bearer(s.owner_token)
    )

    assert response.json()["data"] == [
        {
            "product_id": s.ids["product"],
            "name": "Es Teh",
            "base_price": 5_000,
            "price": 7_000,
            "effective_price": 7_000,
            "is_available": True,
        }
    ]


async def test_removing_the_override_falls_back_to_the_base_price(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    url = f"/api/v1/outlets/{s.outlet_id}/products/{s.ids['product']}"
    await api.put(url, json={"price": 7_000, "is_available": True}, headers=bearer(s.owner_token))

    await api.put(url, json={"price": None, "is_available": True}, headers=bearer(s.owner_token))

    product = next(
        c for c in (await pull(api, s.device_token))["changes"] if c["entity"] == "product"
    )
    assert product["data"]["price"] == 5_000
