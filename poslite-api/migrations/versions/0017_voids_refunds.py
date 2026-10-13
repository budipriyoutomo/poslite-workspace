"""Void & refund (ADR-023): order_voids, refunds with their lines and payments, refund columns in
the read model, and the permissions order.refund and sync.import (ADR-024).

Revision ID: 0017
Revises: 0016
Create Date: 2026-10-07
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

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ULID = sa.CHAR(26)
MONEY = sa.BigInteger()
NEW_PERMISSIONS = {6: "order.refund", 7: "sync.import"}  # ids after the five seeded by 0002
OWNER, MANAGER = 1, 2


def _tenant() -> sa.Column[str]:
    return sa.Column("tenant_id", ULID, sa.ForeignKey("tenants.id"), nullable=False)


def _secure(table: str) -> None:
    for statement in [*enable_tenant_rls(table), *grant_to_app_roles(table)]:
        op.execute(statement)


def upgrade() -> None:
    # One void per order; the order row only changes status (ADR-003: its amounts never change).
    op.create_table(
        "order_voids",
        sa.Column("order_id", ULID, sa.ForeignKey("orders.id"), primary_key=True),
        _tenant(),
        sa.Column("device_id", ULID, sa.ForeignKey("devices.id"), nullable=False),
        sa.Column("reason", sa.String(200), nullable=False),
        sa.Column("voided_by", ULID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("approved_by", ULID, sa.ForeignKey("users.id")),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "synced_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    _secure("order_voids")

    op.create_table(
        "refunds",
        sa.Column("id", ULID, primary_key=True),
        _tenant(),
        sa.Column("outlet_id", ULID, sa.ForeignKey("outlets.id"), nullable=False),
        sa.Column("brand_id", ULID, nullable=False),  # copied from the outlet (trigger)
        sa.Column("device_id", ULID, sa.ForeignKey("devices.id"), nullable=False),
        sa.Column("shift_id", ULID, nullable=False),
        sa.Column("order_id", ULID, sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("refund_no", sa.String(40), nullable=False),
        sa.Column("business_date", sa.Date(), nullable=False),
        sa.Column("reason", sa.String(200), nullable=False),
        sa.Column("refunded_by", ULID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("approved_by", ULID, sa.ForeignKey("users.id")),
        sa.Column("total", MONEY, nullable=False),
        sa.Column("flags", postgresql.ARRAY(sa.String(30)), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "synced_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("tenant_id", "outlet_id", "refund_no"),
    )
    op.create_index(
        "ix_refunds_outlet_business_date", "refunds", ["tenant_id", "outlet_id", "business_date"]
    )
    op.create_index("ix_refunds_order", "refunds", ["order_id"])
    _secure("refunds")
    op.execute(fill_brand_trigger("refunds"))

    op.create_table(
        "refund_lines",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        _tenant(),
        sa.Column("refund_id", ULID, sa.ForeignKey("refunds.id"), nullable=False),
        sa.Column("order_line_id", ULID, sa.ForeignKey("order_lines.id"), nullable=False),
        sa.Column("product_id", ULID, nullable=False),
        sa.Column("product_name", sa.String(150), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("amount", MONEY, nullable=False),
    )
    op.create_index("ix_refund_lines_refund", "refund_lines", ["refund_id"])
    op.create_index("ix_refund_lines_order_line", "refund_lines", ["order_line_id"])
    _secure("refund_lines")
    for role in ("poslite_app", "poslite_system"):
        op.execute(f"GRANT USAGE ON SEQUENCE refund_lines_id_seq TO {role}")

    op.create_table(
        "refund_payments",
        sa.Column("id", ULID, primary_key=True),
        _tenant(),
        sa.Column("refund_id", ULID, sa.ForeignKey("refunds.id"), nullable=False),
        sa.Column("payment_method_id", ULID, nullable=False),
        sa.Column("method_type", sa.String(20), nullable=False),
        sa.Column("method_name", sa.String(100), nullable=False),
        sa.Column("amount", MONEY, nullable=False),
        sa.Column("reference", sa.String(64)),
    )
    op.create_index("ix_refund_payments_refund", "refund_payments", ["refund_id"])
    _secure("refund_payments")

    # Read model: refunds count on the day they were paid out, not on the order's day.
    op.add_column(
        "rpt_daily_sales", sa.Column("refund_amount", MONEY, server_default="0", nullable=False)
    )
    op.add_column(
        "rpt_daily_sales",
        sa.Column("refund_count", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "rpt_daily_product_sales",
        sa.Column("refund_qty", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "rpt_daily_product_sales",
        sa.Column("refund_amount", MONEY, server_default="0", nullable=False),
    )
    op.add_column(
        "rpt_daily_payment_sales",
        sa.Column("refund_amount", MONEY, server_default="0", nullable=False),
    )

    permissions = sa.table(
        "permissions", sa.column("id", sa.SmallInteger()), sa.column("name", sa.String())
    )
    role_permissions = sa.table(
        "role_permissions",
        sa.column("role_id", sa.SmallInteger()),
        sa.column("permission_id", sa.SmallInteger()),
    )
    op.bulk_insert(permissions, [{"id": i, "name": n} for i, n in NEW_PERMISSIONS.items()])
    op.bulk_insert(
        role_permissions,
        [{"role_id": r, "permission_id": p} for r in (OWNER, MANAGER) for p in NEW_PERMISSIONS],
    )


def downgrade() -> None:
    ids = ", ".join(str(i) for i in NEW_PERMISSIONS)
    op.execute(f"DELETE FROM role_permissions WHERE permission_id IN ({ids})")
    op.execute(f"DELETE FROM permissions WHERE id IN ({ids})")
    op.drop_column("rpt_daily_payment_sales", "refund_amount")
    op.drop_column("rpt_daily_product_sales", "refund_amount")
    op.drop_column("rpt_daily_product_sales", "refund_qty")
    op.drop_column("rpt_daily_sales", "refund_count")
    op.drop_column("rpt_daily_sales", "refund_amount")
    for table in ("refund_payments", "refund_lines", "refunds", "order_voids"):
        op.drop_table(table)
