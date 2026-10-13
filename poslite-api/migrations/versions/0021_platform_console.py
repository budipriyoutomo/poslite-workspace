"""Operator console (ADR-025): operators can be disabled, and every operator action is audited.

Both tables stay global like the rest of platform_admin (0008): they belong to no tenant, so no
RLS, and only poslite_system may touch them. `tenant_id` on the audit log is a reference for
filtering, not an isolation key. Audit rows are never updated or deleted.

Revision ID: 0021
Revises: 0020
Create Date: 2026-10-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0021"
down_revision: str | None = "0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("platform_admins", sa.Column("disabled_at", sa.DateTime(timezone=True)))
    op.create_table(
        "platform_audit_log",
        sa.Column("id", sa.CHAR(26), primary_key=True),
        sa.Column("admin_id", sa.CHAR(26), sa.ForeignKey("platform_admins.id"), nullable=False),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("tenant_id", sa.CHAR(26), sa.ForeignKey("tenants.id")),
        sa.Column("target_id", sa.CHAR(26)),
        sa.Column("detail", JSONB(), nullable=False, server_default="{}"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_platform_audit_log_created", "platform_audit_log", ["created_at"])
    op.create_index(
        "ix_platform_audit_log_tenant", "platform_audit_log", ["tenant_id", "created_at"]
    )
    op.execute("GRANT SELECT, INSERT ON platform_audit_log TO poslite_system")


def downgrade() -> None:
    op.drop_table("platform_audit_log")
    op.drop_column("platform_admins", "disabled_at")
