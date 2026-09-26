"""Subscription billing (ADR-018): subscriptions, invoices, and why a tenant is suspended.

Revision ID: 0013
Revises: 0012
Create Date: 2026-09-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from poslite.shared.infrastructure.migration_sql import enable_tenant_rls, grant_to_app_roles

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 'manual' (platform operator) or 'billing' (unpaid invoice); only billing is lifted by paying.
    op.add_column("tenants", sa.Column("suspended_reason", sa.String(20)))
    op.execute("UPDATE tenants SET suspended_reason = 'manual' WHERE status = 'suspended'")
    op.create_table(
        "subscriptions",
        sa.Column("tenant_id", sa.CHAR(26), sa.ForeignKey("tenants.id"), primary_key=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("current_period_end", sa.Date()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("status IN ('trialing', 'active', 'past_due')", name="status"),
    )
    op.create_table(
        "invoices",
        sa.Column("id", sa.CHAR(26), primary_key=True),
        sa.Column("tenant_id", sa.CHAR(26), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("outlet_count", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.BigInteger(), nullable=False),
        sa.Column("amount", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="open"),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True)),
        sa.Column("gateway_ref", sa.String(100)),
        sa.Column("payment_url", sa.Text()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("tenant_id", "period_start", name="uq_invoice_period"),
        sa.CheckConstraint("status IN ('open', 'paid', 'void')", name="status"),
        sa.CheckConstraint("amount >= 0", name="amount_non_negative"),
    )
    op.create_index("ix_invoices_gateway_ref", "invoices", ["gateway_ref"], unique=True)
    for table in ("subscriptions", "invoices"):
        for statement in [*enable_tenant_rls(table), *grant_to_app_roles(table)]:
            op.execute(statement)


def downgrade() -> None:
    op.drop_table("invoices")
    op.drop_table("subscriptions")
    op.drop_column("tenants", "suspended_reason")
