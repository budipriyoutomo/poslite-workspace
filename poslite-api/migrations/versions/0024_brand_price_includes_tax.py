"""Prices that include service and PB1 (ADR-030): a brand setting, and the mode each order was
priced in, so reports and receipts of old orders stay right after the brand changes it.

Revision ID: 0024
Revises: 0023
Create Date: 2026-10-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0024"
down_revision: str | None = "0023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "brands",
        sa.Column("price_includes_tax", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column(
        "orders",
        sa.Column("price_includes_tax", sa.Boolean(), server_default=sa.false(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("orders", "price_includes_tax")
    op.drop_column("brands", "price_includes_tax")
