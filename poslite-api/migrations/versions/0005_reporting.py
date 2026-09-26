"""Reporting read model, maintained by projectors from the outbox (ADR-012).

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from poslite.shared.infrastructure.migration_sql import enable_tenant_rls, grant_to_app_roles

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ULID = sa.CHAR(26)
MONEY = sa.BigInteger()


def _key() -> list[sa.Column[object]]:
    return [
        sa.Column("tenant_id", ULID, sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("outlet_id", ULID, sa.ForeignKey("outlets.id"), primary_key=True),
        sa.Column("business_date", sa.Date(), primary_key=True),
    ]


def _secure(table: str) -> None:
    for statement in [*enable_tenant_rls(table), *grant_to_app_roles(table)]:
        op.execute(statement)


def upgrade() -> None:
    op.create_table(
        "rpt_daily_sales",
        *_key(),
        sa.Column("gross", MONEY, nullable=False),
        sa.Column("discount", MONEY, nullable=False),
        sa.Column("service", MONEY, nullable=False),
        sa.Column("tax", MONEY, nullable=False),
        sa.Column("net", MONEY, nullable=False),
        sa.Column("order_count", sa.Integer(), nullable=False),
        sa.Column("void_count", sa.Integer(), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_table(
        "rpt_daily_product_sales",
        *_key(),
        sa.Column("product_id", ULID, primary_key=True),
        sa.Column("product_name", sa.String(150), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("gross", MONEY, nullable=False),
    )
    op.create_table(
        "rpt_daily_payment_sales",
        *_key(),
        sa.Column("payment_method_id", ULID, primary_key=True),
        sa.Column("method_type", sa.String(20), nullable=False),
        sa.Column("amount", MONEY, nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
    )
    for table in ("rpt_daily_sales", "rpt_daily_product_sales", "rpt_daily_payment_sales"):
        _secure(table)


def downgrade() -> None:
    for table in ("rpt_daily_payment_sales", "rpt_daily_product_sales", "rpt_daily_sales"):
        op.drop_table(table)
