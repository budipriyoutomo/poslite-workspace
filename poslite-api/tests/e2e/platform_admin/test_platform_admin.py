from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from poslite.platform_admin.api import create_admin

from ..identity.helpers import bearer, signup

ADMIN = {"email": "ops@poslite.id", "password": "operator-rahasia"}


@pytest.fixture
async def admin_token(api: AsyncClient, system_engine: AsyncEngine) -> str:
    await create_admin(
        async_sessionmaker(system_engine),
        email=ADMIN["email"],
        name="Ops",
        password=ADMIN["password"],
    )
    response = await api.post("/api/v1/platform/auth/login", json=ADMIN)
    assert response.status_code == 200, response.text
    token: str = response.json()["data"]["token"]
    return token


async def tenants(api: AsyncClient, token: str, query: str = "") -> list[dict[str, Any]]:
    response = await api.get(f"/api/v1/platform/tenants{query}", headers=bearer(token))
    assert response.status_code == 200, response.text
    data: list[dict[str, Any]] = response.json()["data"]
    return data


async def test_lists_every_tenant_across_the_platform(api: AsyncClient, admin_token: str) -> None:
    await signup(api)
    await signup(api, slug="lain", email="b@b.id", outlet={"code": "BDG01", "name": "Bandung"})

    rows = await tenants(api, admin_token)

    assert sorted((t["slug"], t["status"], t["outlet_count"]) for t in rows) == [
        ("lain", "active", 1),
        ("maharasa", "active", 1),
    ]


async def test_suspends_and_reactivates_a_tenant(api: AsyncClient, admin_token: str) -> None:
    owner = await signup(api)
    tenant_id = owner["tenant"]["id"]

    assert (
        await api.post(f"/api/v1/platform/tenants/{tenant_id}/suspend", headers=bearer(admin_token))
    ).status_code == 200
    blocked = await api.post(
        "/api/v1/categories", json={"name": "X"}, headers=bearer(owner["token"])
    )
    assert [t["status"] for t in await tenants(api, admin_token, "?status=suspended")] == [
        "suspended"
    ]

    assert (
        await api.post(
            f"/api/v1/platform/tenants/{tenant_id}/activate", headers=bearer(admin_token)
        )
    ).status_code == 200
    allowed = await api.post(
        "/api/v1/categories", json={"name": "X"}, headers=bearer(owner["token"])
    )

    assert (blocked.status_code, allowed.status_code) == (403, 201)


async def test_rejects_a_wrong_operator_password(api: AsyncClient, admin_token: str) -> None:
    response = await api.post(
        "/api/v1/platform/auth/login", json={**ADMIN, "password": "salah-salah"}
    )

    assert (response.status_code, response.json()["code"]) == (401, "INVALID_CREDENTIALS")


async def test_tenant_tokens_cannot_use_platform_endpoints(api: AsyncClient) -> None:
    owner = await signup(api)

    assert (
        await api.get("/api/v1/platform/tenants", headers=bearer(owner["token"]))
    ).status_code == 401


async def test_operator_tokens_cannot_use_tenant_endpoints(
    api: AsyncClient, admin_token: str
) -> None:
    assert (await api.get("/api/v1/outlets", headers=bearer(admin_token))).status_code == 401


async def test_unknown_tenant_is_not_found(api: AsyncClient, admin_token: str) -> None:
    response = await api.post(
        "/api/v1/platform/tenants/01K5ZT00000000000000000099/suspend", headers=bearer(admin_token)
    )

    assert (response.status_code, response.json()["code"]) == (404, "TENANT_NOT_FOUND")
