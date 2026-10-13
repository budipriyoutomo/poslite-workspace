"""Support actions on a tenant's users: search across tenants, reset a password, (de)activate."""

from typing import Any

from httpx import AsyncClient

from ..identity.helpers import bearer, signup
from .helpers import ops_get, ops_post

MANAGER = {"email": "sari@maharasa.id", "password": "sari-rahasia-1"}


async def add_manager(api: AsyncClient, owner: dict[str, Any]) -> str:
    response = await api.post(
        "/api/v1/users",
        json={
            "name": "Sari",
            **MANAGER,
            "assignments": [{"role": "manager", "scope_type": "company"}],
        },
        headers=bearer(owner["token"]),
    )
    assert response.status_code == 201, response.text
    user_id: str = response.json()["data"]["id"]
    return user_id


async def add_cashier(api: AsyncClient, owner: dict[str, Any]) -> str:
    response = await api.post(
        "/api/v1/users",
        json={
            "name": "Rina",
            "pin": "2468",
            "assignments": [
                {"role": "cashier", "scope_type": "brand", "brand_id": owner["brand_id"]}
            ],
        },
        headers=bearer(owner["token"]),
    )
    assert response.status_code == 201, response.text
    user_id: str = response.json()["data"]["id"]
    return user_id


async def owner_id(api: AsyncClient, admin_token: str, tenant_id: str) -> str:
    tenant = (await ops_get(api, admin_token, f"/tenants/{tenant_id}"))["data"]
    return str(next(u["id"] for u in tenant["users"] if u["roles"] == ["owner"]))


async def login(api: AsyncClient, email: str, password: str) -> int:
    response = await api.post("/api/v1/auth/login", json={"email": email, "password": password})
    return response.status_code


async def test_searches_users_across_tenants(api: AsyncClient, admin_token: str) -> None:
    await signup(api)
    await signup(
        api,
        business_name="Kopi Senja",
        slug="kopi-senja",
        owner_name="Budiman",
        email="budiman@senja.id",
        outlet={"code": "BDG01", "name": "Dago"},
    )

    rows = (await ops_get(api, admin_token, "/users?q=budi"))["data"]

    assert sorted((u["name"], u["email"], u["tenant_name"], u["roles"]) for u in rows) == [
        ("Budi", "budi@maharasa.id", "Warung Maharasa", ["owner"]),
        ("Budiman", "budiman@senja.id", "Kopi Senja", ["owner"]),
    ]


async def test_user_search_needs_two_characters(api: AsyncClient, admin_token: str) -> None:
    response = await api.get("/api/v1/platform/users?q=b", headers=bearer(admin_token))

    assert response.status_code == 422


async def test_resets_a_password_once_and_signs_the_user_out(
    api: AsyncClient, admin_token: str
) -> None:
    owner = await signup(api)
    tenant_id = owner["tenant"]["id"]
    user_id = await owner_id(api, admin_token, tenant_id)

    response = await ops_post(
        api, admin_token, f"/tenants/{tenant_id}/users/{user_id}/reset-password"
    )

    assert response.status_code == 200, response.text
    temporary = response.json()["data"]["password"]
    assert len(temporary) >= 12
    assert await login(api, "budi@maharasa.id", "rahasia-123") == 401
    assert await login(api, "budi@maharasa.id", temporary) == 200
    assert (await api.get("/api/v1/me/access", headers=bearer(owner["token"]))).status_code == 401


async def test_a_pin_only_user_has_no_password_to_reset(api: AsyncClient, admin_token: str) -> None:
    owner = await signup(api)
    cashier = await add_cashier(api, owner)

    response = await ops_post(
        api, admin_token, f"/tenants/{owner['tenant']['id']}/users/{cashier}/reset-password"
    )

    assert (response.status_code, response.json()["code"]) == (409, "USER_HAS_NO_LOGIN")


async def test_a_user_of_another_tenant_is_not_found(api: AsyncClient, admin_token: str) -> None:
    owner = await signup(api)
    other = await signup(
        api, slug="lain", email="b@b.id", outlet={"code": "BDG01", "name": "Bandung"}
    )
    cashier = await add_cashier(api, owner)

    response = await ops_post(
        api, admin_token, f"/tenants/{other['tenant']['id']}/users/{cashier}/deactivate"
    )

    assert (response.status_code, response.json()["code"]) == (404, "USER_NOT_FOUND")


async def test_deactivates_and_reactivates_a_user(api: AsyncClient, admin_token: str) -> None:
    owner = await signup(api)
    tenant_id = owner["tenant"]["id"]
    manager = await add_manager(api, owner)

    off = await ops_post(api, admin_token, f"/tenants/{tenant_id}/users/{manager}/deactivate")

    assert off.status_code == 200, off.text
    assert await login(api, **MANAGER) == 401
    on = await ops_post(api, admin_token, f"/tenants/{tenant_id}/users/{manager}/activate")
    assert on.status_code == 200, on.text
    assert await login(api, **MANAGER) == 200


async def test_the_last_owner_cannot_be_deactivated(api: AsyncClient, admin_token: str) -> None:
    owner = await signup(api)
    tenant_id = owner["tenant"]["id"]
    user_id = await owner_id(api, admin_token, tenant_id)

    response = await ops_post(api, admin_token, f"/tenants/{tenant_id}/users/{user_id}/deactivate")

    assert (response.status_code, response.json()["code"]) == (409, "LAST_OWNER")


async def test_user_actions_are_audited_without_the_password(
    api: AsyncClient, admin_token: str
) -> None:
    owner = await signup(api)
    tenant_id = owner["tenant"]["id"]
    user_id = await owner_id(api, admin_token, tenant_id)
    await ops_post(api, admin_token, f"/tenants/{tenant_id}/users/{user_id}/reset-password")

    [entry] = (await ops_get(api, admin_token, f"/audit?tenant_id={tenant_id}"))["data"]

    assert (entry["action"], entry["target_id"], entry["detail"]) == (
        "user.reset_password",
        user_id,
        {"name": "Budi"},
    )
