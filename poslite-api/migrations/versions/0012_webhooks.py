"""Outgoing webhooks for integrations (ADR-020): endpoints and their deliveries.

Revision ID: 0012
Revises: 0011
Create Date: 2026-09-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY

from poslite.shared.infrastructure.migration_sql import enable_tenant_rls, grant_to_app_roles

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "webhook_endpoints",
        sa.Column("id", sa.CHAR(26), primary_key=True),
        sa.Column("tenant_id", sa.CHAR(26), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("secret", sa.String(64), nullable=False),
        sa.Column("event_types", ARRAY(sa.String(40)), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
    )
    op.create_table(
        "webhook_deliveries",
        sa.Column("id", sa.CHAR(26), primary_key=True),
        sa.Column("tenant_id", sa.CHAR(26), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column(
            "endpoint_id", sa.CHAR(26), sa.ForeignKey("webhook_endpoints.id"), nullable=False
        ),
        sa.Column("event_type", sa.String(40), nullable=False),
        sa.Column("event_key", sa.String(80), nullable=False),  # e.g. the order id: one per event
        sa.Column("body", sa.Text(), nullable=False),  # signed as is; retries send the same bytes
        sa.Column("status", sa.String(10), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_status_code", sa.Integer()),
        sa.Column("last_error", sa.Text()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("delivered_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("endpoint_id", "event_type", "event_key", name="uq_delivery_event"),
        sa.CheckConstraint("status IN ('pending', 'delivered', 'dead')", name="status"),
    )
    op.create_index(
        "ix_webhook_deliveries_due",
        "webhook_deliveries",
        ["next_attempt_at"],
        postgresql_where=sa.text("status = 'pending'"),
    )
    for table in ("webhook_endpoints", "webhook_deliveries"):
        for statement in [*enable_tenant_rls(table), *grant_to_app_roles(table)]:
            op.execute(statement)


def downgrade() -> None:
    op.drop_table("webhook_deliveries")
    op.drop_table("webhook_endpoints")
