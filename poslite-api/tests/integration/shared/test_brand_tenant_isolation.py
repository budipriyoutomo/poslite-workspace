"""ADR-013 for the ADR-022 tables: brands and user assignments stay inside their company."""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine

from poslite.shared.infrastructure.tenancy import set_tenant

TENANT_A = "01K5ZT00000000000000000001"
TENANT_B = "01K5ZT00000000000000000002"


def _id(prefix: str, tenant_id: str) -> str:
    return prefix + tenant_id[len(prefix) :]


@pytest.fixture
async def two_companies(system_engine: AsyncEngine) -> None:
    async with system_engine.begin() as conn:
        for tid in (TENANT_A, TENANT_B):
            params = {
                "t": tid,
                "b": _id("01K5ZB", tid),
                "u": _id("01K5ZU", tid),
                "a": _id("01K5ZA", tid),
            }
            await conn.execute(
                text("INSERT INTO tenants (id, slug, name) VALUES (:t, lower(:slug), :slug)"),
                {**params, "slug": tid[-1]},
            )
            await conn.execute(
                text(
                    "INSERT INTO brands (id, tenant_id, code, name) VALUES (:b, :t, 'MAIN', 'Main')"
                ),
                params,
            )
            await conn.execute(
                text("INSERT INTO users (id, tenant_id, name) VALUES (:u, :t, 'Owner')"), params
            )
            await conn.execute(
                text(
                    "INSERT INTO user_assignments (id, tenant_id, user_id, role_id, scope_type)"
                    " VALUES (:a, :t, :u, 1, 'company')"
                ),
                params,
            )


@pytest.mark.usefixtures("two_companies")
@pytest.mark.parametrize("table", ["brands", "user_assignments"])
async def test_app_role_sees_only_rows_of_its_company(app_engine: AsyncEngine, table: str) -> None:
    async with app_engine.begin() as conn:
        await set_tenant(conn, TENANT_A)
        tenants = (
            (await conn.execute(text(f"SELECT tenant_id FROM {table}")))  # noqa: S608 — constant
            .scalars()
            .all()
        )

    assert tenants == [TENANT_A]


@pytest.mark.usefixtures("two_companies")
@pytest.mark.parametrize("table", ["brands", "user_assignments"])
async def test_app_role_without_company_context_sees_nothing(
    app_engine: AsyncEngine, table: str
) -> None:
    async with app_engine.begin() as conn:
        count = (
            await conn.execute(text(f"SELECT count(*) FROM {table}"))  # noqa: S608 — constant
        ).scalar_one()

    assert count == 0


async def _insert_brand_as(app_engine: AsyncEngine, *, context: str, owner: str) -> None:
    async with app_engine.begin() as conn:
        await set_tenant(conn, context)
        await conn.execute(
            text(
                "INSERT INTO brands (id, tenant_id, code, name)"
                " VALUES ('01K5ZB00000000000000000009', :t, 'X', 'X')"
            ),
            {"t": owner},
        )


@pytest.mark.usefixtures("two_companies")
async def test_app_role_cannot_create_a_brand_for_another_company(app_engine: AsyncEngine) -> None:
    with pytest.raises(DBAPIError, match="row-level security"):
        await _insert_brand_as(app_engine, context=TENANT_A, owner=TENANT_B)
