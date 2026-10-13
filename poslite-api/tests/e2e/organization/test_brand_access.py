"""ADR-022 access matrix: users reach only the brands and outlets they are assigned to."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine

from .brands import Company, as_user, company_with_two_brands

CATEGORY = {"name": "Sushi", "sort_order": 0, "color": "", "print_role": "kitchen"}


@pytest.fixture
async def company(api: AsyncClient, app_engine: AsyncEngine) -> Company:
    return await company_with_two_brands(api, app_engine)


def _code(response: object) -> tuple[int, str]:
    from httpx import Response

    assert isinstance(response, Response)
    return response.status_code, response.json().get("code", "")


# ── Brand-level master data: categories, products, modifier groups, promotions ──────────────


async def test_brand_level_requests_need_the_active_brand(
    api: AsyncClient, company: Company
) -> None:
    response = await api.get("/api/v1/categories", headers=as_user(company.owner))

    assert _code(response) == (422, "BRAND_REQUIRED")


@pytest.mark.parametrize("path", ["categories", "products", "modifier-groups", "promotions"])
async def test_brand_manager_cannot_read_another_brand(
    api: AsyncClient, company: Company, path: str
) -> None:
    headers = as_user(company.brand_a_manager, company.brand_b)

    assert _code(await api.get(f"/api/v1/{path}", headers=headers)) == (403, "BRAND_FORBIDDEN")


async def test_each_brand_lists_only_its_own_menu(api: AsyncClient, company: Company) -> None:
    created = await api.post(
        "/api/v1/categories", json=CATEGORY, headers=as_user(company.owner, company.brand_b)
    )
    assert created.status_code == 201

    brand_a = await api.get("/api/v1/categories", headers=as_user(company.owner, company.brand_a))
    brand_b = await api.get(
        "/api/v1/categories", headers=as_user(company.brand_b_manager, company.brand_b)
    )

    assert brand_a.json()["data"] == []
    assert [c["name"] for c in brand_b.json()["data"]] == ["Sushi"]


async def test_outlet_manager_reads_the_brand_menu_but_cannot_change_it(
    api: AsyncClient, company: Company
) -> None:
    headers = as_user(company.outlet_a1_manager, company.brand_a)

    assert (await api.get("/api/v1/categories", headers=headers)).status_code == 200
    created = await api.post("/api/v1/categories", json=CATEGORY, headers=headers)
    assert _code(created) == (403, "BRAND_FORBIDDEN")


async def test_a_row_of_another_brand_is_not_found_under_the_active_brand(
    api: AsyncClient, company: Company
) -> None:
    category_id = (
        await api.post(
            "/api/v1/categories", json=CATEGORY, headers=as_user(company.owner, company.brand_b)
        )
    ).json()["data"]["id"]
    under_a = as_user(company.owner, company.brand_a)

    updated = await api.put(f"/api/v1/categories/{category_id}", json=CATEGORY, headers=under_a)
    deleted = await api.delete(f"/api/v1/categories/{category_id}", headers=under_a)

    assert _code(updated) == (404, "CATEGORY_NOT_FOUND")
    assert _code(deleted) == (404, "CATEGORY_NOT_FOUND")


async def test_a_product_cannot_use_a_category_of_another_brand(
    api: AsyncClient, company: Company
) -> None:
    category_id = (
        await api.post(
            "/api/v1/categories", json=CATEGORY, headers=as_user(company.owner, company.brand_b)
        )
    ).json()["data"]["id"]

    product = await api.post(
        "/api/v1/products",
        json={"category_id": category_id, "sku": "S-1", "name": "Salmon", "price": 30000},
        headers=as_user(company.owner, company.brand_a),
    )

    assert _code(product) == (422, "CROSS_BRAND_REFERENCE")


async def test_a_promotion_cannot_target_an_outlet_of_another_brand(
    api: AsyncClient, company: Company
) -> None:
    promotion = await api.post(
        "/api/v1/promotions",
        json={
            "name": "Happy hour",
            "type": "percent_off",
            "percentage": 10,
            "outlet_ids": [company.outlet_b1],
        },
        headers=as_user(company.owner, company.brand_a),
    )

    assert _code(promotion) == (422, "CROSS_BRAND_REFERENCE")


# ── Outlet-level data: settings, tables, devices, prices, orders, reports ────────────────────


async def test_outlet_list_holds_only_outlets_in_scope(api: AsyncClient, company: Company) -> None:
    def ids(response: object) -> list[str]:
        from httpx import Response

        assert isinstance(response, Response)
        return [o["id"] for o in response.json()["data"]]

    owner = await api.get("/api/v1/outlets", headers=as_user(company.owner))
    brand_b = await api.get("/api/v1/outlets", headers=as_user(company.brand_b_manager))
    of_brand_a = await api.get(
        "/api/v1/outlets", params={"brand_id": company.brand_a}, headers=as_user(company.owner)
    )

    assert sorted(ids(owner)) == sorted([company.outlet_a1, company.outlet_b1])
    assert ids(brand_b) == [company.outlet_b1]
    assert ids(of_brand_a) == [company.outlet_a1]


@pytest.mark.parametrize(
    "path",
    [
        "outlets/{outlet}",
        "outlets/{outlet}/tables",
        "outlets/{outlet}/devices",
        "outlets/{outlet}/products",
        "orders?outlet_id={outlet}&business_date=2026-10-07",
        "reports/sales-summary?outlet_id={outlet}&from=2026-10-01&to=2026-10-07",
        "reports/sales-summary/export?outlet_id={outlet}&from=2026-10-01&to=2026-10-07",
    ],
)
async def test_outlet_of_another_brand_is_forbidden(
    api: AsyncClient, company: Company, path: str
) -> None:
    url = "/api/v1/" + path.format(outlet=company.outlet_a1)

    for headers in (
        as_user(company.brand_b_manager, company.brand_b),
        as_user(company.outlet_a1_manager, company.brand_a) | {"X-Brand-Id": company.brand_b},
    ):
        assert _code(await api.get(url, headers=headers)) == (403, "OUTLET_FORBIDDEN")


async def test_outlet_must_belong_to_the_active_brand(api: AsyncClient, company: Company) -> None:
    response = await api.get(
        f"/api/v1/outlets/{company.outlet_b1}", headers=as_user(company.owner, company.brand_a)
    )

    assert _code(response) == (403, "OUTLET_FORBIDDEN")


async def test_outlet_manager_cannot_add_outlets(api: AsyncClient, company: Company) -> None:
    response = await api.post(
        "/api/v1/outlets",
        json={
            "brand_id": company.brand_a,
            "code": "JKT02",
            "name": "Kemang 2",
            "timezone": "Asia/Jakarta",
        },
        headers=as_user(company.outlet_a1_manager),
    )

    assert _code(response) == (403, "BRAND_FORBIDDEN")


# ── Company-level pages ──────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("path", ["users", "payment-methods", "webhooks", "billing/subscription"])
async def test_company_pages_need_company_scope(
    api: AsyncClient, company: Company, path: str
) -> None:
    response = await api.get(f"/api/v1/{path}", headers=as_user(company.brand_a_manager))

    assert _code(response) == (403, "COMPANY_SCOPE_REQUIRED")
    assert (await api.get(f"/api/v1/{path}", headers=as_user(company.owner))).status_code == 200
