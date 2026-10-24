"""Items cancelled from an open bill after the kitchen had them (ADR-028): bill_voids with their
lines, and pre-payment void columns in the daily read model.

Revision ID: 0023
Revises: 0022
Create Date: 2026-10-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from poslite.shared.infrastructure.migration_sql import (
    enable_tenant_rls,
    fill_brand_trigger,
    grant_to_app_roles,
)

revision: str = "0023"
down_revision: str | None = "0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ULID = sa.CHAR(26)
MONEY = sa.BigInteger()


def _tenant() -> sa.Column[str]:
    return sa.Column("tenant_id", ULID, sa.ForeignKey("tenants.id"), nullable=False)


def _secure(table: str) -> None:
    for statement in [*enable_tenant_rls(table), *grant_to_app_roles(table)]:
        op.execute(statement)


def upgrade() -> None:
    # The bill itself never reaches the server (ADR-015): bill_id is the device's id, no FK.
    op.create_table(
        "bill_voids",
        sa.Column("id", ULID, primary_key=True),
        _tenant(),
        sa.Column("outlet_id", ULID, sa.ForeignKey("outlets.id"), nullable=False),
        sa.Column("brand_id", ULID, nullable=False),  # copied from the outlet (trigger)
        sa.Column("device_id", ULID, sa.ForeignKey("devices.id"), nullable=False),
        sa.Column("shift_id", ULID, nullable=False),
        sa.Column("business_date", sa.Date(), nullable=False),
        sa.Column("bill_id", ULID, nullable=False),
        sa.Column("scope", sa.String(20), nullable=False),
        sa.Column("table_label", sa.String(30), nullable=False),
        sa.Column("cashier_id", ULID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("approved_by", ULID, sa.ForeignKey("users.id")),
        sa.Column("reason", sa.String(200), nullable=False),
        sa.Column("amount", MONEY, nullable=False),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "synced_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("scope IN ('line', 'bill_cancelled')", name="ck_bill_voids_scope"),
    )
    op.create_index(
        "ix_bill_voids_outlet_business_date",
        "bill_voids",
        ["tenant_id", "outlet_id", "business_date"],
    )
    _secure("bill_voids")
    op.execute(fill_brand_trigger("bill_voids"))

    op.create_table(
        "bill_void_lines",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        _tenant(),
        sa.Column("void_id", ULID, sa.ForeignKey("bill_voids.id"), nullable=False),
        sa.Column("product_id", ULID, nullable=False),
        sa.Column("product_name", sa.String(150), nullable=False),
        sa.Column(
            "modifiers", postgresql.ARRAY(sa.String(100)), nullable=False, server_default="{}"
        ),
        sa.Column("unit_price", MONEY, nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("amount", MONEY, nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
    )
    op.create_index("ix_bill_void_lines_void", "bill_void_lines", ["void_id"])
    _secure("bill_void_lines")
    for role in ("poslite_app", "poslite_system"):
        op.execute(f"GRANT USAGE ON SEQUENCE bill_void_lines_id_seq TO {role}")

    op.add_column(
        "rpt_daily_sales",
        sa.Column("pre_payment_void_count", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "rpt_daily_sales",
        sa.Column("pre_payment_void_amount", MONEY, server_default="0", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("rpt_daily_sales", "pre_payment_void_amount")
    op.drop_column("rpt_daily_sales", "pre_payment_void_count")
    op.drop_table("bill_void_lines")
    op.drop_table("bill_voids")
