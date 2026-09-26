"""Dine-in table label on orders; per-line discount and promotion snapshot on order lines.

Revision ID: 0010
Revises: 0009
Create Date: 2026-09-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("table_label", sa.String(30)))
    op.add_column("order_lines", sa.Column("discount_type", sa.String(20)))
    op.add_column("order_lines", sa.Column("discount_value", sa.BigInteger()))
    op.add_column(
        "order_lines",
        sa.Column("discount_amount", sa.BigInteger(), nullable=False, server_default="0"),
    )
    op.add_column("order_lines", sa.Column("promotion_id", sa.CHAR(26)))
    op.add_column("order_lines", sa.Column("promotion_name", sa.String(100)))


def downgrade() -> None:
    for column in (
        "promotion_name",
        "promotion_id",
        "discount_amount",
        "discount_value",
        "discount_type",
    ):
        op.drop_column("order_lines", column)
    op.drop_column("orders", "table_label")
