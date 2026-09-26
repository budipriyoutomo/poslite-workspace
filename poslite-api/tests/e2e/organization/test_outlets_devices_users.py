from typing import Any

from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from ..identity.helpers import bearer, signup
from ..sync.helpers import outlet_with_menu_and_device, pull
from ..sync.test_push import batch, push


async def test_adds_another_outlet_with_a_unique_code(api: AsyncClient) -> None:
    token = (await signup(api))["token"]

    created = await api.post(
        "/api/v1/outlets",
        json={"code": "BDG01", "name": "Bandung", "timezone": "Asia/Jakarta"},
        headers=bearer(token),
    )
    taken = await api.post(
        "/api/v1/outlets",
        json={"code": "BDG01", "name": "Lagi", "timezone": "Asia/Jakarta"},
        headers=bearer(token),
    )

    assert created.status_code == 201
    assert (taken.status_code, taken.json()["code"]) == (409, "OUTLET_CODE_TAKEN")
    assert [
        o["code"] for o in (await api.get("/api/v1/outlets", headers=bearer(token))).json()["data"]
    ] == ["BDG01", "JKT01"]


async def test_lists_devices_with_their_last_sync(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    await api.get(
        "/api/v1/sync/pull?cursor=0", headers={**bearer(s.device_token), "X-App-Version": "0.2.0"}
    )

    devices = (
        await api.get(f"/api/v1/outlets/{s.outlet_id}/devices", headers=bearer(s.owner_token))
    ).json()["data"]

    assert [(d["code"], d["name"], d["app_version"], d["revoked_at"]) for d in devices] == [
        ("A", "Kasir 1", "0.2.0", None)
    ]
    assert devices[0]["last_seen_at"] is not None


async def test_a_revoked_device_can_no_longer_sync(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    assert (
        await api.delete(f"/api/v1/devices/{s.device_id}", headers=bearer(s.owner_token))
    ).status_code == 200

    assert (
        await api.get("/api/v1/sync/pull?cursor=0", headers=bearer(s.device_token))
    ).status_code == 401
    devices = (
        await api.get(f"/api/v1/outlets/{s.outlet_id}/devices", headers=bearer(s.owner_token))
    ).json()["data"]
    assert devices[0]["revoked_at"] is not None


async def test_removing_a_cashier_from_the_outlet_removes_them_from_its_devices(
    api: AsyncClient,
) -> None:
    s = await outlet_with_menu_and_device(api)
    cursor = (await pull(api, s.device_token))["next_cursor"]

    response = await api.put(
        f"/api/v1/users/{s.ids['siti']}",
        json={"name": "Siti", "is_active": True, "outlets": []},
        headers=bearer(s.owner_token),
    )

    assert response.status_code == 200
    assert [
        (c["entity"], c["op"]) for c in (await pull(api, s.device_token, cursor))["changes"]
    ] == [("user", "delete")]


async def test_renames_and_deactivates_a_user(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    body: dict[str, Any] = {
        "name": "Siti Aminah",
        "is_active": False,
        "outlets": [{"outlet_id": s.outlet_id, "role": "cashier"}],
    }

    await api.put(f"/api/v1/users/{s.ids['siti']}", json=body, headers=bearer(s.owner_token))

    users = (await api.get("/api/v1/users", headers=bearer(s.owner_token))).json()["data"]
    siti = next(u for u in users if u["id"] == s.ids["siti"])
    assert (siti["name"], siti["is_active"]) == ("Siti Aminah", False)


async def test_deletes_a_user_but_not_yourself(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    assert (
        await api.delete(f"/api/v1/users/{s.ids['siti']}", headers=bearer(s.owner_token))
    ).status_code == 200
    self_delete = await api.delete(f"/api/v1/users/{s.ids['owner']}", headers=bearer(s.owner_token))

    assert (self_delete.status_code, self_delete.json()["code"]) == (409, "CANNOT_DELETE_SELF")
    assert s.ids["siti"] not in [
        u["id"]
        for u in (await api.get("/api/v1/users", headers=bearer(s.owner_token))).json()["data"]
    ]


async def test_a_suspended_tenant_keeps_selling_but_cannot_change_master_data(
    api: AsyncClient, system_engine: AsyncEngine
) -> None:
    s = await outlet_with_menu_and_device(api)
    async with system_engine.begin() as conn:
        await conn.execute(text("UPDATE tenants SET status = 'suspended', suspended_at = now()"))

    write = await api.post(
        "/api/v1/categories", json={"name": "Baru"}, headers=bearer(s.owner_token)
    )
    read = await api.get("/api/v1/categories", headers=bearer(s.owner_token))
    sale = await push(api, s.device_token, batch(s))

    assert (write.status_code, write.json()["code"]) == (403, "TENANT_SUSPENDED")
    assert read.status_code == 200
    assert sale.status_code == 200
