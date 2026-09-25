"""ADR-013: tenant isolation is enforced by PostgreSQL row-level security, not by query filters."""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine

from poslite.shared.infrastructure.tenancy import set_tenant

TENANT_A = "01K5ZT00000000000000000001"
TENANT_B = "01K5ZT00000000000000000002"


@pytest.fixture
async def two_tenants_with_outbox_rows(system_engine: AsyncEngine) -> None:
    async with system_engine.begin() as conn:
        for tid, slug in [(TENANT_A, "resto-a"), (TENANT_B, "resto-b")]:
            await conn.execute(
                text("INSERT INTO tenants (id, slug, name) VALUES (:id, :slug, :slug)"),
                {"id": tid, "slug": slug},
            )
            await conn.execute(
                text(
                    "INSERT INTO outbox_messages (id, tenant_id, topic, payload)"
                    " VALUES (:id, :tid, 'test.topic', '{}')"
                ),
                {"id": tid.replace("T", "E"), "tid": tid},
            )


@pytest.mark.usefixtures("two_tenants_with_outbox_rows")
async def test_app_role_sees_only_rows_of_its_tenant(app_engine: AsyncEngine) -> None:
    async with app_engine.begin() as conn:
        await set_tenant(conn, TENANT_A)
        tenants = (
            (await conn.execute(text("SELECT tenant_id FROM outbox_messages"))).scalars().all()
        )

    assert tenants == [TENANT_A]


@pytest.mark.usefixtures("two_tenants_with_outbox_rows")
async def test_app_role_without_tenant_context_sees_nothing(app_engine: AsyncEngine) -> None:
    async with app_engine.begin() as conn:
        count = (await conn.execute(text("SELECT count(*) FROM outbox_messages"))).scalar_one()

    assert count == 0


async def _insert_outbox_row_as(app_engine: AsyncEngine, *, context: str, owner: str) -> None:
    async with app_engine.begin() as conn:
        await set_tenant(conn, context)
        await conn.execute(
            text(
                "INSERT INTO outbox_messages (id, tenant_id, topic, payload)"
                " VALUES ('01K5ZE00000000000000000009', :tid, 'x', '{}')"
            ),
            {"tid": owner},
        )


@pytest.mark.usefixtures("two_tenants_with_outbox_rows")
async def test_app_role_cannot_write_rows_for_another_tenant(app_engine: AsyncEngine) -> None:
    with pytest.raises(DBAPIError, match="row-level security"):
        await _insert_outbox_row_as(app_engine, context=TENANT_A, owner=TENANT_B)


async def test_tenant_context_is_transaction_local(app_engine: AsyncEngine) -> None:
    async with app_engine.begin() as conn:
        await set_tenant(conn, TENANT_A)
    async with app_engine.begin() as conn:
        leaked = (
            await conn.execute(text("SELECT current_setting('app.tenant_id', true)"))
        ).scalar_one()

    assert leaked in (None, "")
