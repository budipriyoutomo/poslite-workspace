"""Day closing (ADR-026): one snapshot per outlet and business date, taken in the back-office.

Revision ID: 0022
Revises: 0021
Create Date: 2026-10-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from poslite.shared.infrastructure.migration_sql import enable_tenant_rls, grant_to_app_roles

revision: str = "0022"
down_revision: str | None = "0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "day_closings",
        sa.Column("id", sa.CHAR(26), primary_key=True),
        sa.Column("tenant_id", sa.CHAR(26), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("outlet_id", sa.CHAR(26), sa.ForeignKey("outlets.id"), nullable=False),
        sa.Column("business_date", sa.Date(), nullable=False),
        sa.Column("closed_by", sa.CHAR(26), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("notes", sa.String(500), nullable=False, server_default=""),
        sa.Column(
            "snapshot", postgresql.JSONB(), nullable=False
        ),  # totals, payments, cash, warnings
        sa.UniqueConstraint("tenant_id", "outlet_id", "business_date"),
    )
    for statement in [*enable_tenant_rls("day_closings"), *grant_to_app_roles("day_closings")]:
        op.execute(statement)


def downgrade() -> None:
    op.drop_table("day_closings")
