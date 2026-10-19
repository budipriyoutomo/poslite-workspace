"""ADR-013 for the ADR-023 tables: every void and refund table is fenced by row-level security."""

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

TABLES = [
    "order_voids",
    "refunds",
    "refund_lines",
    "refund_payments",
    "outlet_payment_method",
    "device_imports",
    "day_closings",
]


@pytest.mark.parametrize("table", TABLES)
async def test_row_level_security_is_forced(owner_engine: AsyncEngine, table: str) -> None:
    async with owner_engine.connect() as conn:
        forced = (
            await conn.execute(
                text(
                    "SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE relname = :t"
                ),
                {"t": table},
            )
        ).scalar_one()
        policies = (
            await conn.execute(
                text(
                    "SELECT count(*) FROM pg_policies"
                    " WHERE tablename = :t AND policyname = 'tenant_isolation'"
                ),
                {"t": table},
            )
        ).scalar_one()

    assert (forced, policies) == (True, 1)


async def test_refunds_can_be_approved_by_owners_and_managers(owner_engine: AsyncEngine) -> None:
    async with owner_engine.connect() as conn:
        roles = (
            await conn.execute(
                text(
                    "SELECT p.name, array_agg(r.name ORDER BY r.id) FROM role_permissions rp"
                    " JOIN permissions p ON p.id = rp.permission_id"
                    " JOIN roles r ON r.id = rp.role_id"
                    " WHERE p.name IN ('order.refund', 'sync.import')"
                    " GROUP BY p.name ORDER BY p.name"
                )
            )
        ).all()

    assert [tuple(r) for r in roles] == [
        ("order.refund", ["owner", "manager"]),
        ("sync.import", ["owner", "manager"]),
    ]
