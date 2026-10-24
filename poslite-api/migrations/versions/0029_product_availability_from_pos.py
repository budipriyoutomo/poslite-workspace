"""Sold out from the POS (P1-2): an outlet's sold-out mark may end by itself, the latest change
wins, and cashiers may set it (permission product.availability).

Revision ID: 0029
Revises: 0028
Create Date: 2026-10-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0029"
down_revision: str | None = "0028"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

AVAILABILITY = 8  # after order.refund (6) and sync.import (7), 0017
OWNER, MANAGER, CASHIER = 1, 2, 3


def upgrade() -> None:
    op.add_column("outlet_products", sa.Column("available_until", sa.DateTime(timezone=True)))
    op.add_column(
        "outlet_products", sa.Column("availability_changed_at", sa.DateTime(timezone=True))
    )
    op.execute(
        f"INSERT INTO permissions (id, name) VALUES ({AVAILABILITY}, 'product.availability')"
    )
    op.execute(
        "INSERT INTO role_permissions (role_id, permission_id) VALUES "
        + ", ".join(f"({r}, {AVAILABILITY})" for r in (OWNER, MANAGER, CASHIER))
    )


def downgrade() -> None:
    op.execute(f"DELETE FROM role_permissions WHERE permission_id = {AVAILABILITY}")
    op.execute(f"DELETE FROM permissions WHERE id = {AVAILABILITY}")
    op.drop_column("outlet_products", "availability_changed_at")
    op.drop_column("outlet_products", "available_until")
