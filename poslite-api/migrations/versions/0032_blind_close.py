"""Blind shift close (15 · UX-02): the cashier counts cash per denomination without seeing the
expected amount. Shifts keep the count; each brand chooses whether its cashiers count blind.

Revision ID: 0032
Revises: 0031
Create Date: 2026-10-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0032"
down_revision: str | None = "0031"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # {"100000": 2, ..., "1": <coins in Rupiah>}; null for a shift closed without a count.
    op.add_column("shifts", sa.Column("denominations", postgresql.JSONB(), nullable=True))
    op.add_column(
        "brands",
        sa.Column("blind_close", sa.Boolean(), server_default=sa.true(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("brands", "blind_close")
    op.drop_column("shifts", "denominations")
