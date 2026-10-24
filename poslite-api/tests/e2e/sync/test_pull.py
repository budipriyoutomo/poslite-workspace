from typing import Any

from httpx import AsyncClient

from ..identity.helpers import bearer
from .helpers import outlet_with_menu_and_device, pull


def _by_entity(changes: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = {}
    for change in changes:
        result.setdefault(change["entity"], []).append(change)
    return result


async def test_initial_pull_returns_all_master_data_for_the_devices_outlet(
    api: AsyncClient,
) -> None:
    s = await outlet_with_menu_and_device(api)

    data = await pull(api, s.device_token)

    changes = _by_entity(data["changes"])
    assert changes["outlet_setting"][0]["data"] | {"receipt_header": ""} == {
        "code": "JKT01",
        "name": "Outlet",
        "timezone": "Asia/Jakarta",
        "business_day_cutoff": "04:00",
        "tax_rate_bps": 1000,
        "service_rate_bps": 500,
        "receipt_header": "",
        "receipt_footer": "",
        "brand": {
            "id": s.brand_id,
            "code": "MAHARASA",
            "name": "Warung Maharasa",
            "logo_key": None,
        },
        "discount_policy": {
            "percentages": [5, 10, 15, 20],
            "amounts": [5000, 10000, 25000, 50000],
            "allow_custom": True,
            "cashier_max_percentage": 20,
            "cashier_max_amount": 50000,
        },
        "price_includes_tax": False,
    }
    assert changes["product"][0]["data"] == {
        "category_id": s.ids["category"],
        "sku": "MN-1",
        "name": "Es Teh",
        "price": 5000,
        "image_key": None,
        "is_available": True,
        "modifier_group_ids": [s.ids["group"]],
    }
    assert changes["category"][0]["data"] == {
        "name": "Minuman",
        "sort_order": 0,
        "print_role": "bar",
    }
    assert changes["modifier_group"][0]["data"] == {
        "name": "Level Gula",
        "min_select": 1,
        "max_select": 1,
    }
    assert [c["data"]["name"] for c in changes["modifier_option"]] == ["Normal", "Less"]
    assert {c["data"]["type"] for c in changes["payment_method"]} == {"cash", "qris"}
    siti = next(c for c in changes["user"] if c["id"] == s.ids["siti"])
    assert siti["data"]["role"] == "cashier"
    assert siti["data"]["pin_iterations"] == 310_000
    assert siti["data"]["pin_hash"]
    assert siti["data"]["pin_salt"]
    assert all(c["op"] == "upsert" for c in data["changes"])
    assert data["has_more"] is False
    assert data["next_cursor"] == max(c["version"] for c in data["changes"])
    assert data["server_time"]
    assert data["media_base_url"] == "http://localhost:8000/media"


async def test_changes_come_in_version_order(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    versions = [c["version"] for c in (await pull(api, s.device_token))["changes"]]

    assert versions == sorted(versions)


async def test_pulling_from_the_latest_cursor_returns_only_newer_changes(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    cursor = (await pull(api, s.device_token))["next_cursor"]
    assert (await pull(api, s.device_token, cursor))["changes"] == []

    await api.put(
        f"/api/v1/products/{s.ids['product']}",
        json={
            "category_id": s.ids["category"],
            "sku": "MN-1",
            "name": "Es Teh",
            "price": 6000,
            "modifier_group_ids": [s.ids["group"]],
        },
        headers=bearer(s.owner_token),
    )

    later = await pull(api, s.device_token, cursor)
    assert [(c["entity"], c["op"], c["data"]["price"]) for c in later["changes"]] == [
        ("product", "upsert", 6000)
    ]
    assert later["next_cursor"] > cursor


async def test_soft_deleted_rows_are_sent_as_deletes(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    cursor = (await pull(api, s.device_token))["next_cursor"]

    await api.delete(f"/api/v1/payment-methods/{s.ids['qris']}", headers=bearer(s.owner_token))

    changes = (await pull(api, s.device_token, cursor))["changes"]
    assert changes == [
        {
            "entity": "payment_method",
            "op": "delete",
            "id": s.ids["qris"],
            "version": changes[0]["version"],
        }
    ]


async def test_pages_with_limit_until_there_is_no_more(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    everything = (await pull(api, s.device_token))["changes"]

    paged: list[dict[str, Any]] = []
    cursor, has_more = 0, True
    while has_more:
        page = await pull(api, s.device_token, cursor, limit=2)
        assert len(page["changes"]) <= 2
        paged += page["changes"]
        cursor, has_more = page["next_cursor"], page["has_more"]

    assert paged == everything


async def test_a_device_only_pulls_its_own_tenants_data(api: AsyncClient) -> None:
    a = await outlet_with_menu_and_device(api)
    b = await outlet_with_menu_and_device(
        api, slug="lain", email="b@b.id", outlet={"code": "BDG01", "name": "Bandung"}
    )

    a_ids = {c["id"] for c in (await pull(api, a.device_token))["changes"]}
    b_ids = {c["id"] for c in (await pull(api, b.device_token))["changes"]}

    assert a_ids.isdisjoint(b_ids)
    assert a.ids["product"] in a_ids
    assert b.ids["product"] in b_ids


async def test_back_office_tokens_cannot_pull(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    response = await api.get("/api/v1/sync/pull?cursor=0", headers=bearer(s.owner_token))

    assert response.status_code == 403
