"""Queue number and guest name on take-away and delivery orders (P1-1): what the counter calls
out, numbered per device and business day so offline tablets never clash.

Revision ID: 0028
Revises: 0027
Create Date: 2026-10-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0028"
down_revision: str | None = "0027"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("queue_no", sa.String(20)))
    op.add_column("orders", sa.Column("customer_name", sa.String(40)))


def downgrade() -> None:
    op.drop_column("orders", "customer_name")
    op.drop_column("orders", "queue_no")
