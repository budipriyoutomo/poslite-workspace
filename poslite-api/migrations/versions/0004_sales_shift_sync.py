"""Sales, shift and sync events (data pushed by devices — immutable once written).

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-25
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from poslite.shared.infrastructure.migration_sql import enable_tenant_rls, grant_to_app_roles

revision: str = "0004"
down_revision: str | None = "0003"
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
    op.create_table(
        "shifts",
        sa.Column("id", ULID, primary_key=True),
        _tenant(),
        sa.Column("outlet_id", ULID, sa.ForeignKey("outlets.id"), nullable=False),
        sa.Column("device_id", ULID, sa.ForeignKey("devices.id"), nullable=False),
        sa.Column("opened_by", ULID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("opening_cash", MONEY, nullable=False),
        sa.Column("business_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("closed_by", ULID, sa.ForeignKey("users.id")),
        sa.Column("closed_at", sa.DateTime(timezone=True)),
        sa.Column("counted_cash", MONEY),
        sa.Column("expected_cash", MONEY),
        sa.Column("variance", MONEY),
        sa.Column(
            "synced_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("status IN ('open', 'closed')", name="status"),
    )
    op.create_index(
        "ix_shifts_outlet_business_date", "shifts", ["tenant_id", "outlet_id", "business_date"]
    )
    _secure("shifts")

    op.create_table(
        "cash_movements",
        sa.Column("id", ULID, primary_key=True),
        _tenant(),
        sa.Column("shift_id", ULID, sa.ForeignKey("shifts.id"), nullable=False),
        sa.Column("type", sa.String(3), nullable=False),
        sa.Column("amount", MONEY, nullable=False),
        sa.Column("reason", sa.String(200), nullable=False),
        sa.Column("created_by", ULID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("type IN ('in', 'out') AND amount > 0", name="movement"),
    )
    op.create_index("ix_cash_movements_shift", "cash_movements", ["shift_id"])
    _secure("cash_movements")

    # No FK from orders to shifts: the server tolerates an order arriving before its shift (03).
    op.create_table(
        "orders",
        sa.Column("id", ULID, primary_key=True),
        _tenant(),
        sa.Column("outlet_id", ULID, sa.ForeignKey("outlets.id"), nullable=False),
        sa.Column("device_id", ULID, sa.ForeignKey("devices.id"), nullable=False),
        sa.Column("shift_id", ULID, nullable=False),
        sa.Column("receipt_no", sa.String(40), nullable=False),
        sa.Column("cashier_id", ULID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("business_date", sa.Date(), nullable=False),
        sa.Column("order_type", sa.String(20), nullable=False),
        sa.Column("subtotal", MONEY, nullable=False),
        sa.Column("discount_type", sa.String(20)),
        sa.Column("discount_value", sa.BigInteger()),
        sa.Column("discount_amount", MONEY, nullable=False),
        sa.Column("service_rate_bps", sa.Integer(), nullable=False),
        sa.Column("tax_rate_bps", sa.Integer(), nullable=False),
        sa.Column("service_charge", MONEY, nullable=False),
        sa.Column("tax", MONEY, nullable=False),
        sa.Column("total", MONEY, nullable=False),
        sa.Column("paid_amount", MONEY, nullable=False),
        sa.Column("change_amount", MONEY, nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("flags", postgresql.ARRAY(sa.String(30)), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "synced_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("tenant_id", "outlet_id", "receipt_no"),
        sa.CheckConstraint("status IN ('paid', 'voided')", name="status"),
    )
    op.create_index(
        "ix_orders_outlet_business_date", "orders", ["tenant_id", "outlet_id", "business_date"]
    )
    op.create_index("ix_orders_shift", "orders", ["shift_id"])
    _secure("orders")

    op.create_table(
        "order_lines",
        sa.Column("id", ULID, primary_key=True),
        _tenant(),
        sa.Column("order_id", ULID, sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("product_id", ULID, nullable=False),
        sa.Column("product_name", sa.String(150), nullable=False),
        sa.Column("category_name", sa.String(100), nullable=False),
        sa.Column("unit_price", MONEY, nullable=False),
        sa.Column("modifiers_total", MONEY, nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("line_total", MONEY, nullable=False),
        sa.Column("notes", sa.String(200), nullable=False, server_default=""),
        sa.Column("sort_order", sa.Integer(), nullable=False),
    )
    op.create_index("ix_order_lines_order", "order_lines", ["order_id"])
    _secure("order_lines")

    op.create_table(
        "order_line_modifiers",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        _tenant(),
        sa.Column("order_line_id", ULID, sa.ForeignKey("order_lines.id"), nullable=False),
        sa.Column("modifier_option_id", ULID, nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("price", MONEY, nullable=False),
    )
    op.create_index("ix_order_line_modifiers_line", "order_line_modifiers", ["order_line_id"])
    _secure("order_line_modifiers")
    for role in ("poslite_app", "poslite_system"):
        op.execute(f"GRANT USAGE ON SEQUENCE order_line_modifiers_id_seq TO {role}")

    op.create_table(
        "payments",
        sa.Column("id", ULID, primary_key=True),
        _tenant(),
        sa.Column("order_id", ULID, sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("payment_method_id", ULID, nullable=False),
        sa.Column("method_type", sa.String(20), nullable=False),
        sa.Column("amount", MONEY, nullable=False),
        sa.Column("reference", sa.String(64)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_payments_order", "payments", ["order_id"])
    _secure("payments")

    op.create_table(
        "sync_events",
        sa.Column("id", ULID, primary_key=True),
        _tenant(),
        sa.Column("device_id", ULID, sa.ForeignKey("devices.id"), nullable=False),
        sa.Column("type", sa.String(30), nullable=False),
        sa.Column("aggregate_id", ULID, nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("error_code", sa.String(50)),
        sa.Column("flags", postgresql.ARRAY(sa.String(30)), nullable=False, server_default="{}"),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "processed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("status IN ('accepted', 'flagged', 'rejected')", name="status"),
    )
    op.create_index("ix_sync_events_device_received", "sync_events", ["device_id", "received_at"])
    _secure("sync_events")


def downgrade() -> None:
    for table in (
        "sync_events",
        "payments",
        "order_line_modifiers",
        "order_lines",
        "orders",
        "cash_movements",
        "shifts",
    ):
        op.drop_table(table)
