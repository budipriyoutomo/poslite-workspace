from typing import Any

from httpx import AsyncClient

from ..identity.helpers import bearer, signup


async def _post(api: AsyncClient, token: str, path: str, body: dict[str, Any]) -> dict[str, Any]:
    response = await api.post(f"/api/v1{path}", json=body, headers=bearer(token))
    assert response.status_code == 201, response.text
    data: dict[str, Any] = response.json()["data"]
    return data


async def _list(api: AsyncClient, token: str, path: str) -> list[dict[str, Any]]:
    response = await api.get(f"/api/v1{path}", headers=bearer(token))
    assert response.status_code == 200, response.text
    data: list[dict[str, Any]] = response.json()["data"]
    return data


async def test_builds_a_menu_with_categories_modifier_groups_and_products(api: AsyncClient) -> None:
    token = (await signup(api))["token"]
    drinks = await _post(api, token, "/categories", {"name": "Minuman", "sort_order": 2})
    sugar = await _post(
        api,
        token,
        "/modifier-groups",
        {
            "name": "Level Gula",
            "min_select": 1,
            "max_select": 1,
            "options": [{"name": "Normal", "price": 0}, {"name": "Less", "price": 0}],
        },
    )

    product = await _post(
        api,
        token,
        "/products",
        {
            "category_id": drinks["id"],
            "sku": "MN-001",
            "name": "Es Teh Manis",
            "price": 5000,
            "modifier_group_ids": [sugar["id"]],
        },
    )

    assert product["modifier_group_ids"] == [sugar["id"]]
    assert [p["name"] for p in await _list(api, token, "/products")] == ["Es Teh Manis"]
    assert [o["name"] for o in (await _list(api, token, "/modifier-groups"))[0]["options"]] == [
        "Normal",
        "Less",
    ]


async def test_updates_a_product(api: AsyncClient) -> None:
    token = (await signup(api))["token"]
    cat = await _post(api, token, "/categories", {"name": "Makanan"})
    product = await _post(
        api,
        token,
        "/products",
        {"category_id": cat["id"], "sku": "MK-1", "name": "Gudeg", "price": 25000},
    )

    response = await api.put(
        f"/api/v1/products/{product['id']}",
        json={
            "category_id": cat["id"],
            "sku": "MK-1",
            "name": "Nasi Gudeg",
            "price": 27000,
            "is_available": False,
        },
        headers=bearer(token),
    )

    assert response.status_code == 200
    assert (await _list(api, token, "/products"))[0] | {"id": ""} == {
        "id": "",
        "category_id": cat["id"],
        "sku": "MK-1",
        "name": "Nasi Gudeg",
        "price": 27000,
        "image_key": None,
        "image_url": None,
        "is_available": False,
        "modifier_group_ids": [],
    }


async def test_deleting_is_a_soft_delete(api: AsyncClient) -> None:
    token = (await signup(api))["token"]
    cat = await _post(api, token, "/categories", {"name": "Makanan"})

    assert (
        await api.delete(f"/api/v1/categories/{cat['id']}", headers=bearer(token))
    ).status_code == 200
    assert await _list(api, token, "/categories") == []


async def test_rejects_a_product_in_an_unknown_category_or_a_duplicate_sku(
    api: AsyncClient,
) -> None:
    token = (await signup(api))["token"]
    cat = await _post(api, token, "/categories", {"name": "Makanan"})
    await _post(
        api, token, "/products", {"category_id": cat["id"], "sku": "MK-1", "name": "A", "price": 1}
    )

    unknown = await api.post(
        "/api/v1/products",
        json={"category_id": "01K5ZC00000000000000000099", "sku": "X", "name": "B", "price": 1},
        headers=bearer(token),
    )
    duplicate = await api.post(
        "/api/v1/products",
        json={"category_id": cat["id"], "sku": "MK-1", "name": "C", "price": 1},
        headers=bearer(token),
    )

    assert (unknown.status_code, unknown.json()["code"]) == (404, "CATEGORY_NOT_FOUND")
    assert (duplicate.status_code, duplicate.json()["code"]) == (409, "SKU_TAKEN")


async def test_rejects_money_that_is_not_integer_rupiah(api: AsyncClient) -> None:
    token = (await signup(api))["token"]
    cat = await _post(api, token, "/categories", {"name": "Makanan"})

    response = await api.post(
        "/api/v1/products",
        json={"category_id": cat["id"], "sku": "A", "name": "A", "price": 1000.5},
        headers=bearer(token),
    )

    assert response.status_code == 422


async def test_a_tenant_cannot_see_or_change_another_tenants_menu(api: AsyncClient) -> None:
    a = (await signup(api))["token"]
    b = (
        await signup(api, slug="lain", email="b@b.id", outlet={"code": "BDG01", "name": "Bandung"})
    )["token"]
    cat = await _post(api, a, "/categories", {"name": "Rahasia A"})

    assert await _list(api, b, "/categories") == []
    response = await api.put(
        f"/api/v1/categories/{cat['id']}", json={"name": "Dibajak"}, headers=bearer(b)
    )
    assert response.status_code == 404


async def test_payment_methods_crud(api: AsyncClient) -> None:
    token = (await signup(api))["token"]

    cash = await _post(
        api, token, "/payment-methods", {"type": "cash", "name": "Tunai", "sort_order": 1}
    )
    await _post(
        api,
        token,
        "/payment-methods",
        {"type": "debit", "name": "Debit BCA", "requires_reference": True, "sort_order": 2},
    )

    assert [m["name"] for m in await _list(api, token, "/payment-methods")] == [
        "Tunai",
        "Debit BCA",
    ]
    assert (
        await api.delete(f"/api/v1/payment-methods/{cash['id']}", headers=bearer(token))
    ).status_code == 200
    assert [m["name"] for m in await _list(api, token, "/payment-methods")] == ["Debit BCA"]
