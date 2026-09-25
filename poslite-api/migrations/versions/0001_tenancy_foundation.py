"""Tenancy foundation: tenants, sync version sequence, outbox, role grants.

Revision ID: 0001
Revises:
Create Date: 2026-09-25
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from poslite.shared.infrastructure.migration_sql import (
    APP_ROLES,
    SYNC_VERSION_FUNCTION,
    enable_tenant_rls,
    grant_to_app_roles,
)

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for role in APP_ROLES:
        op.execute(f"GRANT USAGE ON SCHEMA public TO {role}")
        # Sequences (sync_version_seq and future ones) are used through nextval() in triggers.
        op.execute(
            f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO {role}"
        )

    # Global table (no RLS): one row per SaaS customer.
    op.create_table(
        "tenants",
        sa.Column("id", sa.CHAR(26), primary_key=True),
        sa.Column("slug", sa.String(63), nullable=False, unique=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("default_timezone", sa.String(64), nullable=False, server_default="Asia/Jakarta"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("suspended_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("status IN ('active', 'suspended')", name="status"),
    )
    for statement in grant_to_app_roles("tenants"):
        op.execute(statement)

    for statement in SYNC_VERSION_FUNCTION:
        op.execute(statement)
    for role in APP_ROLES:
        op.execute(f"GRANT USAGE, SELECT ON SEQUENCE sync_version_seq TO {role}")

    op.create_table(
        "outbox_messages",
        sa.Column("id", sa.CHAR(26), primary_key=True),
        sa.Column("tenant_id", sa.CHAR(26), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("topic", sa.String(100), nullable=False),
        sa.Column("payload", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text()),
    )
    op.create_index(
        "ix_outbox_messages_unpublished",
        "outbox_messages",
        ["created_at"],
        postgresql_where=sa.text("published_at IS NULL"),
    )
    for statement in [
        *enable_tenant_rls("outbox_messages"),
        *grant_to_app_roles("outbox_messages"),
    ]:
        op.execute(statement)


def downgrade() -> None:
    op.drop_table("outbox_messages")
    op.execute("DROP FUNCTION assign_sync_version()")
    op.execute("DROP SEQUENCE sync_version_seq")
    op.drop_table("tenants")
    for role in APP_ROLES:
        op.execute(
            "ALTER DEFAULT PRIVILEGES IN SCHEMA public"
            f" REVOKE USAGE, SELECT ON SEQUENCES FROM {role}"
        )
        op.execute(f"REVOKE USAGE ON SCHEMA public FROM {role}")
