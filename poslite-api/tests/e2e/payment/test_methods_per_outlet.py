"""Payment methods per outlet (doc 11 §3): methods belong to the company, each outlet turns them
on or off; devices drop methods their outlet does not take."""

from typing import Any

from httpx import AsyncClient

from ..identity.helpers import bearer
from ..sync.helpers import Setup, outlet_with_menu_and_device, pull
from ..sync.test_push import batch, push

CARD = {"type": "debit", "name": "Debit BCA", "requires_reference": True, "sort_order": 3}


async def _methods(api: AsyncClient, s: Setup) -> dict[str, list[str]]:
    rows = (await api.get("/api/v1/payment-methods", headers=bearer(s.owner_token))).json()["data"]
    return {m["name"]: m["outlet_ids"] for m in rows}


async def _second_outlet(api: AsyncClient, s: Setup) -> str:
    created = await api.post(
        "/api/v1/outlets",
        json={"brand_id": s.brand_id, "code": "BDG01", "name": "Dago"},
        headers=bearer(s.owner_token),
    )
    outlet_id: str = created.json()["data"]["id"]
    return outlet_id


async def test_a_new_method_is_on_at_every_outlet_and_a_new_outlet_takes_every_method(
    api: AsyncClient,
) -> None:
    s = await outlet_with_menu_and_device(api)
    await api.post("/api/v1/payment-methods", json=CARD, headers=bearer(s.owner_token))
    dago = await _second_outlet(api, s)

    methods = await _methods(api, s)

    assert sorted(methods["Debit BCA"]) == sorted([s.outlet_id, dago])
    assert sorted(methods["Tunai"]) == sorted([s.outlet_id, dago])


async def test_an_outlet_can_turn_a_method_off_and_its_devices_drop_it(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    dago = await _second_outlet(api, s)
    cursor = (await pull(api, s.device_token))["next_cursor"]

    response = await api.put(
        f"/api/v1/payment-methods/{s.ids['qris']}/outlets",
        json={"outlet_ids": [dago]},
        headers=bearer(s.owner_token),
    )
    changes = (await pull(api, s.device_token, cursor))["changes"]

    assert response.status_code == 200
    assert (await _methods(api, s))["QRIS"] == [dago]
    assert [(c["entity"], c["op"], c["id"]) for c in changes] == [
        ("payment_method", "delete", s.ids["qris"])
    ]


async def test_an_unknown_outlet_is_not_found(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    response = await api.put(
        f"/api/v1/payment-methods/{s.ids['qris']}/outlets",
        json={"outlet_ids": ["01K5ZT0000000000000000ZZZZ"]},
        headers=bearer(s.owner_token),
    )

    assert (response.status_code, response.json()["code"]) == (404, "OUTLET_NOT_FOUND")


async def test_a_sale_with_a_method_the_outlet_turned_off_is_kept_but_flagged(
    api: AsyncClient,
) -> None:
    s = await outlet_with_menu_and_device(api)
    await api.put(
        f"/api/v1/payment-methods/{s.ids['cash']}/outlets",
        json={"outlet_ids": []},
        headers=bearer(s.owner_token),
    )

    response = await push(api, s.device_token, batch(s))
    results: list[dict[str, Any]] = response.json()["data"]["results"]

    order = next(r for r in results if r["status"] in ("flagged", "accepted") and r.get("flags"))
    assert order["flags"] == ["PAYMENT_METHOD_INACTIVE"]
