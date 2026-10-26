"""Table screen (15 · UX-04): an open bill keeps its number of guests and when its bill was
printed, so every device of a table-service outlet shows the same table status.

Revision ID: 0033
Revises: 0032
Create Date: 2026-10-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0033"
down_revision: str | None = "0032"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("open_bills", sa.Column("guest_count", sa.SmallInteger(), nullable=True))
    op.add_column("open_bills", sa.Column("printed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("open_bills", "printed_at")
    op.drop_column("open_bills", "guest_count")
