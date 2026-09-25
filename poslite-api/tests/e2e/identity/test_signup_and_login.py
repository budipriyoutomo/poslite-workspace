from httpx import AsyncClient

from .helpers import SIGNUP, bearer, signup


async def test_signup_creates_tenant_owner_and_first_outlet(api: AsyncClient) -> None:
    data = await signup(api)

    assert data["tenant"] == {
        "id": data["tenant"]["id"],
        "slug": "maharasa",
        "name": "Warung Maharasa",
        "status": "active",
    }
    assert data["user"]["role"] == "owner"
    outlets = (await api.get("/api/v1/outlets", headers=bearer(data["token"]))).json()["data"]
    assert [(o["code"], o["name"]) for o in outlets] == [("JKT01", "Outlet Kemang")]


async def test_signup_rejects_a_taken_slug_or_email(api: AsyncClient) -> None:
    await signup(api)

    taken_slug = await api.post("/api/v1/tenants/signup", json={**SIGNUP, "email": "other@x.id"})
    taken_email = await api.post("/api/v1/tenants/signup", json={**SIGNUP, "slug": "other"})

    assert (taken_slug.status_code, taken_slug.json()["code"]) == (409, "SLUG_TAKEN")
    assert (taken_email.status_code, taken_email.json()["code"]) == (409, "EMAIL_TAKEN")


async def test_validation_errors_use_the_contract_envelope(api: AsyncClient) -> None:
    response = await api.post("/api/v1/tenants/signup", json={**SIGNUP, "email": "not-an-email"})

    body = response.json()
    assert response.status_code == 422
    assert body["code"] == "VALIDATION_ERROR"
    assert "email" in body["errors"]


async def test_login_returns_a_token_for_the_right_password(api: AsyncClient) -> None:
    await signup(api)

    response = await api.post(
        "/api/v1/auth/login", json={"email": SIGNUP["email"], "password": SIGNUP["password"]}
    )

    assert response.status_code == 200
    assert response.json()["data"]["tenant"]["slug"] == "maharasa"
    token = response.json()["data"]["token"]
    assert (await api.get("/api/v1/outlets", headers=bearer(token))).status_code == 200


async def test_login_rejects_a_wrong_password(api: AsyncClient) -> None:
    await signup(api)

    response = await api.post(
        "/api/v1/auth/login", json={"email": SIGNUP["email"], "password": "salah"}
    )

    assert (response.status_code, response.json()["code"]) == (401, "INVALID_CREDENTIALS")


async def test_logout_revokes_the_token(api: AsyncClient) -> None:
    token = (await signup(api))["token"]

    assert (await api.post("/api/v1/auth/logout", headers=bearer(token))).status_code == 200
    assert (await api.get("/api/v1/outlets", headers=bearer(token))).status_code == 401


async def test_requests_without_a_valid_token_are_unauthorized(api: AsyncClient) -> None:
    assert (await api.get("/api/v1/outlets")).status_code == 401
    assert (await api.get("/api/v1/outlets", headers=bearer("nope"))).status_code == 401


async def test_a_tenant_only_sees_its_own_outlets(api: AsyncClient) -> None:
    a = await signup(api)
    b = await signup(
        api, slug="warung-b", email="b@b.id", outlet={"code": "BDG01", "name": "Bandung"}
    )

    a_codes = [
        o["code"]
        for o in (await api.get("/api/v1/outlets", headers=bearer(a["token"]))).json()["data"]
    ]
    b_codes = [
        o["code"]
        for o in (await api.get("/api/v1/outlets", headers=bearer(b["token"]))).json()["data"]
    ]

    assert (a_codes, b_codes) == (["JKT01"], ["BDG01"])
