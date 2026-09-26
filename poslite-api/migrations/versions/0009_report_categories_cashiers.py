"""Read model: sales per category and per cashier.

Revision ID: 0009
Revises: 0008
Create Date: 2026-09-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from poslite.shared.infrastructure.migration_sql import enable_tenant_rls, grant_to_app_roles

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _key() -> list[sa.Column[object]]:
    return [
        sa.Column("tenant_id", sa.CHAR(26), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("outlet_id", sa.CHAR(26), sa.ForeignKey("outlets.id"), primary_key=True),
        sa.Column("business_date", sa.Date(), primary_key=True),
    ]


def upgrade() -> None:
    op.create_table(
        "rpt_daily_category_sales",
        *_key(),
        sa.Column("category_name", sa.String(100), primary_key=True),  # snapshot on the order line
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("gross", sa.BigInteger(), nullable=False),
    )
    op.create_table(
        "rpt_daily_cashier_sales",
        *_key(),
        sa.Column("cashier_id", sa.CHAR(26), primary_key=True),
        sa.Column("order_count", sa.Integer(), nullable=False),
        sa.Column("net", sa.BigInteger(), nullable=False),
    )
    for table in ("rpt_daily_category_sales", "rpt_daily_cashier_sales"):
        for statement in [*enable_tenant_rls(table), *grant_to_app_roles(table)]:
            op.execute(statement)


def downgrade() -> None:
    op.drop_table("rpt_daily_cashier_sales")
    op.drop_table("rpt_daily_category_sales")
