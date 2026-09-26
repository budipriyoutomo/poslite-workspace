"""Dynamic QRIS charges (ADR-019): created by a device online, confirmed by the gateway.

Revision ID: 0014
Revises: 0013
Create Date: 2026-09-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from poslite.shared.infrastructure.migration_sql import enable_tenant_rls, grant_to_app_roles

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "qris_charges",
        sa.Column("id", sa.CHAR(26), primary_key=True),  # ULID from the device (retry-safe)
        sa.Column("tenant_id", sa.CHAR(26), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("outlet_id", sa.CHAR(26), sa.ForeignKey("outlets.id"), nullable=False),
        sa.Column("device_id", sa.CHAR(26), sa.ForeignKey("devices.id"), nullable=False),
        sa.Column("amount", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="pending"),
        sa.Column("gateway_ref", sa.String(100), nullable=False, unique=True),
        sa.Column("qr_string", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("amount > 0", name="amount_positive"),
        sa.CheckConstraint("status IN ('pending', 'paid', 'expired')", name="status"),
    )
    for statement in [*enable_tenant_rls("qris_charges"), *grant_to_app_roles("qris_charges")]:
        op.execute(statement)


def downgrade() -> None:
    op.drop_table("qris_charges")
