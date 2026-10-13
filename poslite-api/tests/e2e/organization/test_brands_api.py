"""Brands CRUD (ADR-022): company-level master data; a brand owns menu, promotions and outlets."""

from typing import Any

from httpx import AsyncClient, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from poslite.shared.infrastructure.tenancy import set_tenant

from ..identity.helpers import signup
from .brands import as_user, company_with_two_brands

SUSHI = {"code": "sushi", "name": "Maharasa Sushi", "receipt_header": "Maharasa Sushi"}


def _code(response: Response) -> tuple[int, str]:
    return response.status_code, response.json().get("code", "")


async def _create(api: AsyncClient, token: str, **body: Any) -> Response:
    return await api.post("/api/v1/brands", json={**SUSHI, **body}, headers=as_user(token))


async def test_owner_creates_lists_and_updates_brands(api: AsyncClient) -> None:
    owner = await signup(api)

    created = await _create(api, owner["token"])
    brand_id = created.json()["data"]["id"]
    updated = await api.put(
        f"/api/v1/brands/{brand_id}",
        json={**SUSHI, "name": "Sushi Bar", "receipt_footer": "Arigato!"},
        headers=as_user(owner["token"]),
    )
    listed = await api.get("/api/v1/brands", headers=as_user(owner["token"]))

    assert created.status_code == 201
    assert created.json()["data"] | {"id": "x"} == {
        "id": "x",
        "code": "SUSHI",
        "name": "Maharasa Sushi",
        "logo_key": None,
        "logo_url": None,
        "receipt_header": "Maharasa Sushi",
        "receipt_footer": "",
        "is_active": True,
        "discount": {  # the old POS presets and a 20% / Rp 50.000 cashier limit by default
            "percentages": [5, 10, 15, 20],
            "amounts": [5000, 10000, 25000, 50000],
            "allow_custom": True,
            "cashier_max_percentage": 20,
            "cashier_max_amount": 50000,
        },
    }
    assert updated.json()["data"]["receipt_footer"] == "Arigato!"
    assert [(b["code"], b["name"]) for b in listed.json()["data"]] == [
        ("MAHARASA", "Warung Maharasa"),
        ("SUSHI", "Sushi Bar"),
    ]


async def test_brand_code_is_unique_in_the_company(api: AsyncClient) -> None:
    owner = await signup(api)
    await _create(api, owner["token"])

    assert _code(await _create(api, owner["token"], code="Sushi")) == (409, "BRAND_CODE_TAKEN")


async def test_a_logo_must_be_an_uploaded_object_of_the_company(api: AsyncClient) -> None:
    owner = await signup(api)

    response = await _create(api, owner["token"], logo_key="other-tenant/products/x.png")

    assert _code(response) == (422, "INVALID_IMAGE_KEY")


async def test_a_brand_with_live_outlets_cannot_be_deleted(api: AsyncClient) -> None:
    owner = await signup(api)
    brand_id = (await _create(api, owner["token"])).json()["data"]["id"]
    headers = as_user(owner["token"])

    assert (await api.delete(f"/api/v1/brands/{owner['brand_id']}", headers=headers)).json()[
        "code"
    ] == "BRAND_HAS_OUTLETS"
    assert (await api.delete(f"/api/v1/brands/{brand_id}", headers=headers)).status_code == 200
    listed = await api.get("/api/v1/brands", headers=headers)
    assert [b["code"] for b in listed.json()["data"]] == ["MAHARASA"]


async def test_changing_a_brand_re_versions_its_outlets(
    api: AsyncClient, app_engine: AsyncEngine
) -> None:
    owner = await signup(api)

    async def outlet_version() -> int:
        async with app_engine.begin() as conn:
            await set_tenant(conn, owner["tenant"]["id"])
            return int((await conn.execute(text("SELECT version FROM outlets"))).scalar_one())

    before = await outlet_version()
    await api.put(
        f"/api/v1/brands/{owner['brand_id']}",
        json={"code": "MAHARASA", "name": "Maharasa Baru"},
        headers=as_user(owner["token"]),
    )

    assert await outlet_version() > before


async def test_only_company_wide_users_manage_brands(
    api: AsyncClient, app_engine: AsyncEngine
) -> None:
    company = await company_with_two_brands(api, app_engine)

    response = await _create(api, company.brand_a_manager, code="RAMEN")

    assert _code(response) == (403, "COMPANY_SCOPE_REQUIRED")


async def test_a_new_outlet_belongs_to_the_brand_in_its_body(
    api: AsyncClient, app_engine: AsyncEngine
) -> None:
    company = await company_with_two_brands(api, app_engine)
    body = {"code": "BDG02", "name": "Sushi Riau", "timezone": "Asia/Jakarta"}

    created = await api.post(
        "/api/v1/outlets",
        json={**body, "brand_id": company.brand_b},
        headers=as_user(company.brand_b_manager),
    )
    other_brand = await api.post(
        "/api/v1/outlets",
        json={**body, "code": "JKT09", "brand_id": company.brand_a},
        headers=as_user(company.brand_b_manager),
    )
    missing = await api.post("/api/v1/outlets", json=body, headers=as_user(company.owner))

    assert created.status_code == 201
    assert created.json()["data"]["brand_id"] == company.brand_b
    assert _code(other_brand) == (403, "BRAND_FORBIDDEN")
    assert missing.status_code == 422
