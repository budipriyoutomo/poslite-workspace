"""Master data for Fase 4: dining tables per outlet and automatic promotions (ADR-015, ADR-016).

Revision ID: 0011
Revises: 0010
Create Date: 2026-09-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY

from poslite.shared.infrastructure.migration_sql import (
    enable_tenant_rls,
    grant_to_app_roles,
    sync_version_trigger,
)

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _master() -> list[sa.Column[object]]:
    return [
        sa.Column("version", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
    ]


def _secure(table: str) -> None:
    for statement in [
        *enable_tenant_rls(table),
        *sync_version_trigger(table),
        *grant_to_app_roles(table),
    ]:
        op.execute(statement)


def upgrade() -> None:
    op.create_table(
        "dining_tables",
        sa.Column("id", sa.CHAR(26), primary_key=True),
        sa.Column("tenant_id", sa.CHAR(26), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("outlet_id", sa.CHAR(26), sa.ForeignKey("outlets.id"), nullable=False),
        sa.Column("label", sa.String(30), nullable=False),
        sa.Column("area", sa.String(50), nullable=False, server_default=""),
        sa.Column("seats", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        *_master(),
    )
    op.create_index(
        "uq_dining_tables_outlet_label",
        "dining_tables",
        ["outlet_id", sa.text("lower(label)")],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    _secure("dining_tables")

    op.create_table(
        "promotions",
        sa.Column("id", sa.CHAR(26), primary_key=True),
        sa.Column("tenant_id", sa.CHAR(26), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("percentage", sa.Integer()),
        sa.Column("buy_qty", sa.Integer()),
        sa.Column("get_qty", sa.Integer()),
        sa.Column("product_ids", ARRAY(sa.CHAR(26)), nullable=False, server_default="{}"),
        sa.Column("category_ids", ARRAY(sa.CHAR(26)), nullable=False, server_default="{}"),
        sa.Column("outlet_ids", ARRAY(sa.CHAR(26)), nullable=False, server_default="{}"),
        sa.Column("days_of_week", ARRAY(sa.SmallInteger()), nullable=False, server_default="{}"),
        sa.Column("start_time", sa.String(5)),
        sa.Column("end_time", sa.String(5)),
        sa.Column("starts_on", sa.Date()),
        sa.Column("ends_on", sa.Date()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_master(),
        sa.CheckConstraint("type IN ('percent_off', 'buy_x_get_y')", name="type"),
        sa.CheckConstraint(
            "(type = 'percent_off' AND percentage BETWEEN 1 AND 100)"
            " OR (type = 'buy_x_get_y' AND buy_qty > 0 AND get_qty > 0)",
            name="rule",
        ),
    )
    _secure("promotions")


def downgrade() -> None:
    op.drop_table("promotions")
    op.drop_table("dining_tables")
