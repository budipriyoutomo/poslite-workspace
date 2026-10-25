"""Cash rounding per outlet (P1-3): only the part paid in cash is rounded, to 100, 500 or 1000,
nearest or down; the order keeps its total and records the rounding, reported per day.

Revision ID: 0030
Revises: 0029
Create Date: 2026-10-25
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0030"
down_revision: str | None = "0029"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "outlets",
        sa.Column("cash_rounding_unit", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "outlets",
        sa.Column("cash_rounding_mode", sa.String(10), nullable=False, server_default="nearest"),
    )
    op.create_check_constraint(
        "ck_outlets_cash_rounding",
        "outlets",
        "cash_rounding_unit IN (0, 100, 500, 1000) AND cash_rounding_mode IN ('nearest', 'down')",
    )
    op.add_column(
        "orders",
        sa.Column("rounding_amount", sa.BigInteger(), nullable=False, server_default="0"),
    )
    op.add_column(
        "rpt_daily_sales",
        sa.Column("cash_rounding", sa.BigInteger(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("rpt_daily_sales", "cash_rounding")
    op.drop_column("orders", "rounding_amount")
    op.drop_constraint("ck_outlets_cash_rounding", "outlets")
    op.drop_column("outlets", "cash_rounding_mode")
    op.drop_column("outlets", "cash_rounding_unit")
