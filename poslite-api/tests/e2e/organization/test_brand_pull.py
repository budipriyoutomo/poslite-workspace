"""ADR-022 on the device: an outlet's tablet gets its brand, its brand's menu and promotions,
and only the users who may work there."""

from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine

from ..sync.helpers import pull
from .brands import Company, as_user, company_with_two_brands


async def _post(api: AsyncClient, token: str, brand: str, path: str, body: dict[str, Any]) -> str:
    response = await api.post(f"/api/v1/{path}", json=body, headers=as_user(token, brand))
    assert response.status_code == 201, response.text
    created: str = response.json()["data"]["id"]
    return created


async def _menu(api: AsyncClient, token: str, brand: str, name: str) -> dict[str, str]:
    category = await _post(api, token, brand, "categories", {"name": name})
    group = await _post(
        api,
        token,
        brand,
        "modifier-groups",
        {"name": f"{name} level", "options": [{"name": "Pedas", "price": 0}]},
    )
    product = await _post(
        api,
        token,
        brand,
        "products",
        {
            "category_id": category,
            "sku": "SKU-1",  # the same SKU in both brands
            "name": name,
            "price": 20000,
            "modifier_group_ids": [group],
        },
    )
    promotion = await _post(
        api,
        token,
        brand,
        "promotions",
        {
            "name": f"{name} hemat",
            "type": "percent_off",
            "percentage": 10,
            "category_ids": [category],
        },
    )
    return {"category": category, "group": group, "product": product, "promotion": promotion}


@pytest.fixture
async def company(api: AsyncClient, app_engine: AsyncEngine) -> Company:
    return await company_with_two_brands(api, app_engine)


async def _device_of_outlet_b1(api: AsyncClient, company: Company) -> str:
    response = await api.post(
        "/api/v1/devices/activate",
        json={
            "email": "b@maharasa.id",
            "password": "rahasia-123",
            "outlet_id": company.outlet_b1,
            "device_name": "Kasir Sushi",
        },
    )
    assert response.status_code == 201, response.text
    token: str = response.json()["data"]["token"]
    return token


def _ids(changes: list[dict[str, Any]], entity: str, op: str = "upsert") -> set[str]:
    return {c["id"] for c in changes if c["entity"] == entity and c["op"] == op}


async def test_a_device_gets_only_the_menu_and_promotions_of_its_brand(
    api: AsyncClient, company: Company
) -> None:
    brand_a = await _menu(api, company.owner, company.brand_a, "Nasi Goreng")
    brand_b = await _menu(api, company.owner, company.brand_b, "Salmon Roll")
    device = await _device_of_outlet_b1(api, company)

    changes = (await pull(api, device))["changes"]

    for entity, key in [
        ("category", "category"),
        ("modifier_group", "group"),
        ("product", "product"),
        ("promotion", "promotion"),
    ]:
        assert brand_b[key] in _ids(changes, entity)
        assert brand_a[key] not in _ids(changes, entity) | _ids(changes, entity, "delete")
    options = [c for c in changes if c["entity"] == "modifier_option"]
    assert [o["data"]["modifier_group_id"] for o in options] == [brand_b["group"]]


async def test_outlet_setting_carries_the_brand_and_its_receipt_text(
    api: AsyncClient, company: Company
) -> None:
    await api.put(
        f"/api/v1/brands/{company.brand_b}",
        json={
            "code": "SUSHI",
            "name": "Sushi",
            "receipt_header": "Sushi",
            "receipt_footer": "Arigato",
        },
        headers=as_user(company.owner),
    )
    device = await _device_of_outlet_b1(api, company)

    setting = next(
        c for c in (await pull(api, device))["changes"] if c["entity"] == "outlet_setting"
    )

    assert setting["data"]["brand"] == {
        "id": company.brand_b,
        "code": "SUSHI",
        "name": "Sushi",
        "logo_key": None,
    }
    assert (setting["data"]["receipt_header"], setting["data"]["receipt_footer"]) == (
        "Sushi",
        "Arigato",
    )


async def test_an_outlet_header_overrides_the_brand_header(
    api: AsyncClient, company: Company
) -> None:
    await api.put(
        f"/api/v1/brands/{company.brand_b}",
        json={
            "code": "SUSHI",
            "name": "Sushi",
            "receipt_header": "Sushi",
            "receipt_footer": "Arigato",
        },
        headers=as_user(company.owner),
    )
    await api.put(
        f"/api/v1/outlets/{company.outlet_b1}",
        json={
            "name": "Sushi Dago",
            "timezone": "Asia/Jakarta",
            "business_day_cutoff": "04:00",
            "tax_rate_bps": 1000,
            "service_rate_bps": 0,
            "receipt_header": "Sushi Dago\nJl. Dago 1",
        },
        headers=as_user(company.owner),
    )
    device = await _device_of_outlet_b1(api, company)

    setting = next(
        c for c in (await pull(api, device))["changes"] if c["entity"] == "outlet_setting"
    )

    assert (setting["data"]["receipt_header"], setting["data"]["receipt_footer"]) == (
        "Sushi Dago\nJl. Dago 1",
        "Arigato",
    )


async def test_a_brand_change_reaches_devices_on_the_next_pull(
    api: AsyncClient, company: Company
) -> None:
    device = await _device_of_outlet_b1(api, company)
    cursor = (await pull(api, device))["next_cursor"]

    await api.put(
        f"/api/v1/brands/{company.brand_b}",
        json={"code": "SUSHI", "name": "Sushi Bar"},
        headers=as_user(company.owner),
    )
    changes = (await pull(api, device, cursor))["changes"]

    assert [c["data"]["brand"]["name"] for c in changes if c["entity"] == "outlet_setting"] == [
        "Sushi Bar"
    ]


async def test_users_of_other_brands_never_reach_the_device(
    api: AsyncClient, company: Company
) -> None:
    device = await _device_of_outlet_b1(api, company)

    users = {
        c["id"]: c["data"]["role"]
        for c in (await pull(api, device))["changes"]
        if c["entity"] == "user" and c["op"] == "upsert"
    }

    assert sorted(users.values()) == ["manager", "owner"]  # brand B manager + company owner
