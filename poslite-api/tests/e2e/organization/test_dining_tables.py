from typing import Any

from httpx import AsyncClient

from ..identity.helpers import bearer
from ..sync.helpers import outlet_with_menu_and_device, pull


async def _add(api: AsyncClient, token: str, outlet_id: str, **body: Any) -> Any:
    return await api.post(
        f"/api/v1/outlets/{outlet_id}/tables",
        json={"label": "A1", "area": "Dalam", "seats": 4, "sort_order": 0, **body},
        headers=bearer(token),
    )


async def test_manages_tables_per_outlet(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    created = await _add(api, s.owner_token, s.outlet_id)
    assert created.status_code == 201
    table = created.json()["data"]

    updated = await api.put(
        f"/api/v1/tables/{table['id']}",
        json={"label": "A2", "area": "Teras", "seats": 2, "sort_order": 1},
        headers=bearer(s.owner_token),
    )
    listed = await api.get(f"/api/v1/outlets/{s.outlet_id}/tables", headers=bearer(s.owner_token))

    assert updated.status_code == 200
    assert listed.json()["data"] == [
        {"id": table["id"], "label": "A2", "area": "Teras", "seats": 2, "sort_order": 1}
    ]


async def test_a_label_is_unique_per_outlet(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    await _add(api, s.owner_token, s.outlet_id)

    again = await _add(api, s.owner_token, s.outlet_id, label="a1")

    assert again.status_code == 409
    assert again.json()["code"] == "TABLE_LABEL_TAKEN"


async def test_a_deleted_label_can_be_reused(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    table = (await _add(api, s.owner_token, s.outlet_id)).json()["data"]
    await api.delete(f"/api/v1/tables/{table['id']}", headers=bearer(s.owner_token))

    assert (await _add(api, s.owner_token, s.outlet_id)).status_code == 201


async def test_devices_pull_the_tables_of_their_outlet(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    table = (await _add(api, s.owner_token, s.outlet_id)).json()["data"]
    other = (
        await api.post(
            "/api/v1/outlets",
            json={"code": "BDG01", "name": "Dago"},
            headers=bearer(s.owner_token),
        )
    ).json()["data"]
    await _add(api, s.owner_token, other["id"], label="B1")

    changes = [
        c for c in (await pull(api, s.device_token))["changes"] if c["entity"] == "dining_table"
    ]

    assert changes == [
        {
            "entity": "dining_table",
            "op": "upsert",
            "id": table["id"],
            "version": changes[0]["version"],
            "data": {"label": "A1", "area": "Dalam", "seats": 4, "sort_order": 0},
        }
    ]
