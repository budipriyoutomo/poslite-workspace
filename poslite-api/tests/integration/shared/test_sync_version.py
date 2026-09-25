"""ADR-009: master rows get `version` from one sequence via trigger, in commit order."""

from collections.abc import AsyncIterator

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from poslite.shared.infrastructure.migration_sql import enable_tenant_rls, sync_version_trigger
from poslite.shared.infrastructure.tenancy import set_tenant

TENANT = "01K5ZT00000000000000000001"


@pytest.fixture
async def master_table(
    owner_engine: AsyncEngine, system_engine: AsyncEngine
) -> AsyncIterator[None]:
    async with owner_engine.begin() as conn:
        await conn.execute(
            text(
                "CREATE TABLE zz_test_master (id char(26) PRIMARY KEY, tenant_id char(26) NOT NULL,"
                " name text NOT NULL, version bigint NOT NULL DEFAULT 0, deleted_at timestamptz)"
            )
        )
        for statement in [
            *enable_tenant_rls("zz_test_master"),
            *sync_version_trigger("zz_test_master"),
        ]:
            await conn.execute(text(statement))
        await conn.execute(text("GRANT ALL ON zz_test_master TO poslite_app"))
    async with system_engine.begin() as conn:
        await conn.execute(
            text("INSERT INTO tenants (id, slug, name) VALUES (:id, 'a', 'A')"), {"id": TENANT}
        )
    yield
    async with owner_engine.begin() as conn:
        await conn.execute(text("DROP TABLE zz_test_master"))


async def _version(app_engine: AsyncEngine, row_id: str) -> int:
    async with app_engine.begin() as conn:
        await set_tenant(conn, TENANT)
        return int(
            (
                await conn.execute(
                    text("SELECT version FROM zz_test_master WHERE id = :id"), {"id": row_id}
                )
            ).scalar_one()
        )


async def _write(app_engine: AsyncEngine, sql: str, **params: str) -> None:
    async with app_engine.begin() as conn:
        await set_tenant(conn, TENANT)
        await conn.execute(text(sql), {"tenant": TENANT, **params})


@pytest.mark.usefixtures("master_table")
async def test_insert_update_and_soft_delete_each_raise_the_version(
    app_engine: AsyncEngine,
) -> None:
    await _write(
        app_engine,
        "INSERT INTO zz_test_master (id, tenant_id, name) VALUES ('P1', :tenant, 'Gudeg')",
    )
    inserted = await _version(app_engine, "P1")
    await _write(app_engine, "UPDATE zz_test_master SET name = 'Nasi Gudeg' WHERE id = 'P1'")
    updated = await _version(app_engine, "P1")
    await _write(app_engine, "UPDATE zz_test_master SET deleted_at = now() WHERE id = 'P1'")
    deleted = await _version(app_engine, "P1")

    assert 0 < inserted < updated < deleted


@pytest.mark.usefixtures("master_table")
async def test_client_supplied_version_is_ignored(app_engine: AsyncEngine) -> None:
    await _write(
        app_engine,
        "INSERT INTO zz_test_master (id, tenant_id, name, version)"
        " VALUES ('P1', :tenant, 'x', 999999)",
    )

    assert await _version(app_engine, "P1") < 999999


@pytest.mark.usefixtures("master_table")
async def test_later_commits_get_higher_versions(app_engine: AsyncEngine) -> None:
    await _write(
        app_engine, "INSERT INTO zz_test_master (id, tenant_id, name) VALUES ('P1', :tenant, 'a')"
    )
    await _write(
        app_engine, "INSERT INTO zz_test_master (id, tenant_id, name) VALUES ('P2', :tenant, 'b')"
    )

    assert await _version(app_engine, "P1") < await _version(app_engine, "P2")
