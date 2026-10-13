"""What an operator sees of a tenant: search, paging, detail and the platform summary."""

from typing import Any

from httpx import AsyncClient

from ..identity.helpers import bearer, signup
from .helpers import ops_get, ops_post


async def three_tenants(api: AsyncClient) -> list[dict[str, Any]]:
    return [
        await signup(api),
        await signup(
            api,
            business_name="Kopi Senja",
            slug="kopi-senja",
            email="tini@senja.id",
            outlet={"code": "BDG01", "name": "Dago"},
        ),
        await signup(
            api,
            business_name="Bakso Pak Kumis",
            slug="bakso",
            email="kumis@bakso.id",
            outlet={"code": "SBY01", "name": "Darmo"},
        ),
    ]


async def test_searches_tenants_by_name_slug_or_owner_email(
    api: AsyncClient, admin_token: str
) -> None:
    await three_tenants(api)

    by_name = await ops_get(api, admin_token, "/tenants?q=senja")
    by_email = await ops_get(api, admin_token, "/tenants?q=KUMIS@")

    assert [t["slug"] for t in by_name["data"]] == ["kopi-senja"]
    assert [t["slug"] for t in by_email["data"]] == ["bakso"]
    assert by_name["meta"] == {"total": 1, "limit": 50, "offset": 0}


async def test_pages_through_tenants_newest_first(api: AsyncClient, admin_token: str) -> None:
    await three_tenants(api)

    first = await ops_get(api, admin_token, "/tenants?limit=2")
    second = await ops_get(api, admin_token, "/tenants?limit=2&offset=2")

    assert [t["slug"] for t in first["data"]] == ["bakso", "kopi-senja"]
    assert [t["slug"] for t in second["data"]] == ["maharasa"]
    assert second["meta"] == {"total": 3, "limit": 2, "offset": 2}


async def test_shows_a_tenant_with_its_owner_outlets_users_and_devices(
    api: AsyncClient, admin_token: str
) -> None:
    owner = await signup(api)
    await api.post(
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

    tenant = (await ops_get(api, admin_token, f"/tenants/{owner['tenant']['id']}"))["data"]

    assert (tenant["name"], tenant["slug"], tenant["status"]) == (
        "Warung Maharasa",
        "maharasa",
        "active",
    )
    assert tenant["owners"] == [{"name": "Budi", "email": "budi@maharasa.id"}]
    assert [
        (o["code"], o["name"], o["brand_name"], o["device_count"]) for o in tenant["outlets"]
    ] == [("JKT01", "Outlet Kemang", "Warung Maharasa", 0)]
    assert sorted(
        (u["name"], u["roles"], u["has_login"], u["is_active"]) for u in tenant["users"]
    ) == [
        ("Budi", ["owner"], True, True),
        ("Rina", ["cashier"], False, True),
    ]
    assert tenant["devices"] == []
    assert tenant["subscription"] is None  # the billing job has not run yet
    assert tenant["invoices"] == []


async def test_unknown_tenant_detail_is_not_found(api: AsyncClient, admin_token: str) -> None:
    response = await api.get(
        "/api/v1/platform/tenants/01K5ZT00000000000000000099", headers=bearer(admin_token)
    )

    assert (response.status_code, response.json()["code"]) == (404, "TENANT_NOT_FOUND")


async def test_summarises_the_platform(api: AsyncClient, admin_token: str) -> None:
    tenants = await three_tenants(api)
    await ops_post(api, admin_token, f"/tenants/{tenants[0]['tenant']['id']}/suspend")

    summary = (await ops_get(api, admin_token, "/summary"))["data"]

    assert summary == {
        "tenants": 3,
        "active_tenants": 2,
        "suspended_tenants": 1,
        "trialing": 0,
        "paying": 0,
        "past_due": 0,
        "outlets": 3,
        "devices": 0,
        "monthly_recurring_revenue": 0,
        "open_invoice_amount": 0,
    }


async def test_suspending_is_audited_for_the_tenant(api: AsyncClient, admin_token: str) -> None:
    owner = await signup(api)
    tenant_id = owner["tenant"]["id"]
    await ops_post(api, admin_token, f"/tenants/{tenant_id}/suspend")
    await ops_post(api, admin_token, f"/tenants/{tenant_id}/activate")

    entries = (await ops_get(api, admin_token, f"/audit?tenant_id={tenant_id}"))["data"]

    assert [(e["action"], e["tenant_id"], e["tenant_name"]) for e in entries] == [
        ("tenant.activate", tenant_id, "Warung Maharasa"),
        ("tenant.suspend", tenant_id, "Warung Maharasa"),
    ]
