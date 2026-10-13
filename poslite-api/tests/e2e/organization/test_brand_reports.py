"""ADR-022 reports: without a filter, every outlet the user may see (the whole company for a
company-wide user); `brand_id` and `outlet_id` narrow it down."""

from datetime import date
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from poslite.shared.infrastructure.tenancy import set_tenant

from .brands import Company, as_user, company_with_two_brands

DAY = "2026-10-07"
RANGE = {"from": "2026-10-01", "to": "2026-10-07"}


@pytest.fixture
async def company(api: AsyncClient, app_engine: AsyncEngine) -> Company:
    company = await company_with_two_brands(api, app_engine)
    tenant = (await api.get("/api/v1/me/access", headers=as_user(company.owner))).json()["data"]
    async with app_engine.begin() as conn:
        await set_tenant(conn, tenant["tenant"]["id"])
        for outlet_id, net in [(company.outlet_a1, 100_000), (company.outlet_b1, 40_000)]:
            await conn.execute(
                text(
                    "INSERT INTO rpt_daily_sales (tenant_id, outlet_id, business_date, gross,"
                    " discount, service, tax, net, order_count, void_count)"
                    " VALUES (:t, :o, :d, :n, 0, 0, 0, :n, 2, 0)"
                ),
                {
                    "t": tenant["tenant"]["id"],
                    "o": outlet_id,
                    "d": date.fromisoformat(DAY),
                    "n": net,
                },
            )
    return company


async def _summary(api: AsyncClient, token: str, **params: str) -> dict[str, Any]:
    response = await api.get(
        "/api/v1/reports/sales-summary", params={**RANGE, **params}, headers=as_user(token)
    )
    assert response.status_code == 200, response.text
    data: dict[str, Any] = response.json()["data"]
    return data


async def test_company_report_adds_up_every_outlet(api: AsyncClient, company: Company) -> None:
    report = await _summary(api, company.owner)

    assert report["totals"]["net"] == 140_000
    assert report["days"] == [
        {
            "business_date": DAY,
            "gross": 140_000,
            "discount": 0,
            "service": 0,
            "tax": 0,
            "net": 140_000,
            "order_count": 4,
            "void_count": 0,
            "refund_amount": 0,
            "refund_count": 0,
        }
    ]


async def test_brand_and_outlet_filters_narrow_the_report(
    api: AsyncClient, company: Company
) -> None:
    by_brand = await _summary(api, company.owner, brand_id=company.brand_b)
    by_outlet = await _summary(api, company.owner, outlet_id=company.outlet_a1)

    assert (by_brand["totals"]["net"], by_outlet["totals"]["net"]) == (40_000, 100_000)


async def test_a_brand_manager_sees_only_their_brand(api: AsyncClient, company: Company) -> None:
    report = await _summary(api, company.brand_b_manager)
    forbidden = await api.get(
        "/api/v1/reports/sales-summary",
        params={**RANGE, "brand_id": company.brand_a},
        headers=as_user(company.brand_b_manager),
    )

    assert report["totals"]["net"] == 40_000
    assert (forbidden.status_code, forbidden.json()["code"]) == (403, "BRAND_FORBIDDEN")


async def test_export_without_an_outlet_is_named_after_the_scope(
    api: AsyncClient, company: Company
) -> None:
    response = await api.get(
        "/api/v1/reports/sales-summary/export",
        params={**RANGE, "brand_id": company.brand_b},
        headers=as_user(company.owner),
    )

    assert response.status_code == 200
    assert (
        'filename="penjualan-SUSHI-2026-10-01-2026-10-07.csv"'
        in response.headers["content-disposition"]
    )
