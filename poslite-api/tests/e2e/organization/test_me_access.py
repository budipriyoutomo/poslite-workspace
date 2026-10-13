"""GET /me/access: the brands and outlets a back-office user may pick (ADR-022)."""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine

from .brands import as_user, company_with_two_brands


async def test_owner_sees_the_whole_company(api: AsyncClient, app_engine: AsyncEngine) -> None:
    company = await company_with_two_brands(api, app_engine)

    access = (await api.get("/api/v1/me/access", headers=as_user(company.owner))).json()["data"]

    assert access["tenant"]["name"] == "Warung Maharasa"
    assert access["company_scope"] is True
    assert [
        (b["code"], b["role"], [o["code"] for o in b["outlets"]]) for b in access["brands"]
    ] == [
        ("MAHARASA", "owner", ["JKT01"]),
        ("SUSHI", "owner", ["BDG01"]),
    ]
    assert access["brands"][1]["outlets"][0] == {
        "id": company.outlet_b1,
        "code": "BDG01",
        "name": "Sushi Dago",
        "role": "owner",
    }


async def test_brand_manager_sees_only_their_brand(
    api: AsyncClient, app_engine: AsyncEngine
) -> None:
    company = await company_with_two_brands(api, app_engine)

    access = (await api.get("/api/v1/me/access", headers=as_user(company.brand_b_manager))).json()[
        "data"
    ]

    assert access["company_scope"] is False
    assert [(b["id"], b["role"]) for b in access["brands"]] == [(company.brand_b, "manager")]
    assert [o["id"] for o in access["brands"][0]["outlets"]] == [company.outlet_b1]


async def test_outlet_manager_sees_their_outlet_without_a_brand_role(
    api: AsyncClient, app_engine: AsyncEngine
) -> None:
    company = await company_with_two_brands(api, app_engine)

    access = (
        await api.get("/api/v1/me/access", headers=as_user(company.outlet_a1_manager))
    ).json()["data"]

    assert [(b["id"], b["role"]) for b in access["brands"]] == [(company.brand_a, None)]
    assert [(o["id"], o["role"]) for o in access["brands"][0]["outlets"]] == [
        (company.outlet_a1, "manager")
    ]
