"""ADR-027: credential-taking public endpoints answer 429 after too many attempts."""

from httpx import AsyncClient, Response

from .helpers import SIGNUP, signup


def assert_limited(response: Response) -> None:
    assert (response.status_code, response.json()["code"]) == (429, "RATE_LIMITED")
    assert int(response.headers["Retry-After"]) > 0


async def test_login_is_limited_per_email(api: AsyncClient) -> None:
    await signup(api)
    wrong = {"email": SIGNUP["email"], "password": "wrong-password"}
    attempts = [await api.post("/api/v1/auth/login", json=wrong) for _ in range(10)]

    limited = await api.post("/api/v1/auth/login", json=wrong)
    other = await api.post(
        "/api/v1/auth/login", json={"email": "other@x.id", "password": "wrong-password"}
    )

    assert {r.status_code for r in attempts} == {401}
    assert_limited(limited)
    assert other.status_code == 401


async def test_signup_is_limited_per_client_address(api: AsyncClient) -> None:
    await signup(api)
    for _ in range(4):  # refused signups still count as attempts
        assert (await api.post("/api/v1/tenants/signup", json=SIGNUP)).status_code == 409

    assert_limited(await api.post("/api/v1/tenants/signup", json={**SIGNUP, "slug": "baru"}))


async def test_device_activation_is_limited_per_email(api: AsyncClient) -> None:
    body = {
        "email": "nobody@x.id",
        "password": "wrong-password",
        "outlet_id": "01K5ZT00000000000000000001",
        "device_name": "Kasir 1",
    }
    for _ in range(10):
        assert (await api.post("/api/v1/devices/activate", json=body)).status_code == 401

    assert_limited(await api.post("/api/v1/devices/activate", json=body))


async def test_operator_login_is_limited_per_email(api: AsyncClient) -> None:
    body = {"email": "ops@x.id", "password": "wrong-password"}
    for _ in range(5):
        assert (await api.post("/api/v1/platform/auth/login", json=body)).status_code == 401

    assert_limited(await api.post("/api/v1/platform/auth/login", json=body))
