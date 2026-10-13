from typing import Any

from httpx import AsyncClient

from .helpers import SIGNUP, bearer, signup


async def _activate(api: AsyncClient, outlet_id: str, **overrides: Any) -> Any:
    body = {
        "email": SIGNUP["email"],
        "password": SIGNUP["password"],
        "outlet_id": outlet_id,
        "device_name": "Kasir Depan",
        "platform": "android",
    }
    return await api.post("/api/v1/devices/activate", json={**body, **overrides})


async def _outlet_id(api: AsyncClient, token: str) -> str:
    outlet_id: str = (await api.get("/api/v1/outlets", headers=bearer(token))).json()["data"][0][
        "id"
    ]
    return outlet_id


async def test_activation_gives_the_device_a_code_and_a_token(api: AsyncClient) -> None:
    owner = await signup(api)
    outlet_id = await _outlet_id(api, owner["token"])

    response = await _activate(api, outlet_id)

    data = response.json()["data"]
    assert response.status_code == 201
    assert data["device"]["code"] == "A"
    assert data["device"]["outlet"] == {
        "id": outlet_id,
        "brand_id": owner["brand_id"],
        "code": "JKT01",
        "name": "Outlet Kemang",
        "timezone": "Asia/Jakarta",
    }
    assert data["token"]
    assert data["server_time"]


async def test_each_device_of_an_outlet_gets_the_next_code(api: AsyncClient) -> None:
    owner = await signup(api)
    outlet_id = await _outlet_id(api, owner["token"])

    codes = [(await _activate(api, outlet_id)).json()["data"]["device"]["code"] for _ in range(3)]

    assert codes == ["A", "B", "C"]


async def test_device_token_identifies_the_device(api: AsyncClient) -> None:
    owner = await signup(api)
    activated = (await _activate(api, await _outlet_id(api, owner["token"]))).json()["data"]

    me = await api.get("/api/v1/devices/me", headers=bearer(activated["token"]))

    assert me.status_code == 200
    assert me.json()["data"]["device"]["id"] == activated["device"]["id"]


async def test_activation_rejects_wrong_credentials(api: AsyncClient) -> None:
    owner = await signup(api)

    response = await _activate(api, await _outlet_id(api, owner["token"]), password="salah")  # noqa: S106 — a deliberately wrong test password

    assert (response.status_code, response.json()["code"]) == (401, "INVALID_CREDENTIALS")


async def test_activation_rejects_an_outlet_of_another_tenant(api: AsyncClient) -> None:
    await signup(api)
    other = await signup(
        api, slug="lain", email="lain@x.id", outlet={"code": "SBY01", "name": "Surabaya"}
    )

    response = await _activate(api, await _outlet_id(api, other["token"]))

    assert (response.status_code, response.json()["code"]) == (404, "OUTLET_NOT_FOUND")


async def test_a_back_office_token_cannot_act_as_a_device(api: AsyncClient) -> None:
    owner = await signup(api)

    response = await api.get("/api/v1/devices/me", headers=bearer(owner["token"]))

    assert (response.status_code, response.json()["code"]) == (403, "FORBIDDEN")
