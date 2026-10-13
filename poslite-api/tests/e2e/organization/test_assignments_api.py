"""GET/PUT /users/{id}/assignments (ADR-022): roles over the company, a brand, or an outlet."""

from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncEngine

from .brands import Company, as_user, company_with_two_brands

BRAND_B_MANAGER_ID = "01K5ZU0000000000000000000B"


@pytest.fixture
async def company(api: AsyncClient, app_engine: AsyncEngine) -> Company:
    return await company_with_two_brands(api, app_engine)


async def _put(api: AsyncClient, token: str, user_id: str, rows: list[dict[str, Any]]) -> Response:
    return await api.put(
        f"/api/v1/users/{user_id}/assignments", json={"assignments": rows}, headers=as_user(token)
    )


async def _get(api: AsyncClient, token: str, user_id: str) -> list[dict[str, Any]]:
    response = await api.get(f"/api/v1/users/{user_id}/assignments", headers=as_user(token))
    assert response.status_code == 200, response.text
    rows: list[dict[str, Any]] = response.json()["data"]
    return rows


async def test_replaces_the_assignments_of_a_user(api: AsyncClient, company: Company) -> None:
    rows = [
        {"role": "manager", "scope_type": "brand", "brand_id": company.brand_b},
        {"role": "manager", "scope_type": "outlet", "outlet_id": company.outlet_a1},
    ]

    response = await _put(api, company.owner, BRAND_B_MANAGER_ID, rows)

    assert response.status_code == 200
    assert await _get(api, company.owner, BRAND_B_MANAGER_ID) == [
        {"role": "manager", "scope_type": "brand", "brand_id": company.brand_b, "outlet_id": None},
        {
            "role": "manager",
            "scope_type": "outlet",
            "brand_id": company.brand_a,  # filled in from the outlet
            "outlet_id": company.outlet_a1,
        },
    ]
    access = await api.get("/api/v1/me/access", headers=as_user(company.brand_b_manager))
    assert [b["id"] for b in access.json()["data"]["brands"]] == [  # ordered by code
        company.brand_a,
        company.brand_b,
    ]


@pytest.mark.parametrize(
    ("row", "code"),
    [
        ({"role": "owner", "scope_type": "brand", "brand_id": "B"}, "INVALID_ASSIGNMENT"),
        ({"role": "cashier", "scope_type": "company"}, "INVALID_ASSIGNMENT"),
        ({"role": "manager", "scope_type": "brand"}, "INVALID_ASSIGNMENT"),
        ({"role": "manager", "scope_type": "outlet"}, "INVALID_ASSIGNMENT"),
    ],
)
async def test_rejects_assignments_that_break_the_scope_rules(
    api: AsyncClient, company: Company, row: dict[str, Any], code: str
) -> None:
    if row.get("brand_id") == "B":
        row = {**row, "brand_id": company.brand_b}

    response = await _put(api, company.owner, BRAND_B_MANAGER_ID, [row])

    assert (response.status_code, response.json()["code"]) == (422, code)


async def test_an_outlet_assignment_must_name_the_outlet_brand(
    api: AsyncClient, company: Company
) -> None:
    row = {
        "role": "manager",
        "scope_type": "outlet",
        "brand_id": company.brand_b,
        "outlet_id": company.outlet_a1,
    }

    response = await _put(api, company.owner, BRAND_B_MANAGER_ID, [row])

    assert (response.status_code, response.json()["code"]) == (422, "CROSS_BRAND_REFERENCE")


async def _owner_id(api: AsyncClient, company: Company) -> str:
    users = (await api.get("/api/v1/users", headers=as_user(company.owner))).json()["data"]
    return str(next(u["id"] for u in users if u["email"] == "budi@maharasa.id"))


async def test_the_last_owner_keeps_the_company(api: AsyncClient, company: Company) -> None:
    owner_id = await _owner_id(api, company)
    rows = [{"role": "manager", "scope_type": "company"}]

    response = await _put(api, company.owner, owner_id, rows)

    assert (response.status_code, response.json()["code"]) == (409, "LAST_OWNER")


async def test_the_last_owner_cannot_be_deactivated(api: AsyncClient, company: Company) -> None:
    owner_id = await _owner_id(api, company)

    response = await api.put(
        f"/api/v1/users/{owner_id}",
        json={"name": "Budi", "is_active": False},
        headers=as_user(company.owner),
    )

    assert (response.status_code, response.json()["code"]) == (409, "LAST_OWNER")


async def test_the_last_owner_cannot_be_deleted(api: AsyncClient, company: Company) -> None:
    owner_id = await _owner_id(api, company)
    await _put(
        api, company.owner, BRAND_B_MANAGER_ID, [{"role": "manager", "scope_type": "company"}]
    )

    response = await api.delete(
        f"/api/v1/users/{owner_id}", headers=as_user(company.brand_b_manager)
    )

    assert (response.status_code, response.json()["code"]) == (409, "LAST_OWNER")


async def test_an_owner_steps_down_once_another_owner_exists(
    api: AsyncClient, company: Company
) -> None:
    owner_id = await _owner_id(api, company)
    await _put(api, company.owner, BRAND_B_MANAGER_ID, [{"role": "owner", "scope_type": "company"}])

    deactivated = await api.put(
        f"/api/v1/users/{owner_id}",
        json={"name": "Budi", "is_active": False},
        headers=as_user(company.brand_b_manager),
    )

    assert deactivated.status_code == 200, deactivated.text


async def test_only_company_wide_users_assign_roles(api: AsyncClient, company: Company) -> None:
    rows = [{"role": "manager", "scope_type": "company"}]

    response = await _put(api, company.brand_a_manager, BRAND_B_MANAGER_ID, rows)

    assert (response.status_code, response.json()["code"]) == (403, "COMPANY_SCOPE_REQUIRED")


async def test_creates_a_user_with_assignments_and_lists_them(
    api: AsyncClient, company: Company
) -> None:
    created = await api.post(
        "/api/v1/users",
        json={
            "name": "Rina",
            "pin": "2468",
            "assignments": [
                {"role": "cashier", "scope_type": "brand", "brand_id": company.brand_b}
            ],
        },
        headers=as_user(company.owner),
    )
    users = (await api.get("/api/v1/users", headers=as_user(company.owner))).json()["data"]

    assert created.status_code == 201, created.text
    rina = next(u for u in users if u["name"] == "Rina")
    assert rina["assignments"] == [
        {"role": "cashier", "scope_type": "brand", "brand_id": company.brand_b, "outlet_id": None}
    ]
    assert rina["outlets"] == [{"outlet_id": company.outlet_b1, "role": "cashier"}]


async def test_a_new_user_needs_outlets_or_assignments(api: AsyncClient, company: Company) -> None:
    response = await api.post(
        "/api/v1/users", json={"name": "Rina", "pin": "2468"}, headers=as_user(company.owner)
    )

    assert response.status_code == 422


async def test_renaming_a_user_without_outlets_keeps_their_assignments(
    api: AsyncClient, company: Company
) -> None:
    response = await api.put(
        f"/api/v1/users/{BRAND_B_MANAGER_ID}",
        json={"name": "Manajer Sushi", "is_active": True},
        headers=as_user(company.owner),
    )

    assert response.status_code == 200
    assert await _get(api, company.owner, BRAND_B_MANAGER_ID) == [
        {"role": "manager", "scope_type": "brand", "brand_id": company.brand_b, "outlet_id": None}
    ]
