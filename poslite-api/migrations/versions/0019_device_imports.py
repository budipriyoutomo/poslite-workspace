"""Emergency imports (ADR-024): every device export imported in the back-office, with who did it
and what came of each event — the audit record of an import.

Revision ID: 0019
Revises: 0018
Create Date: 2026-10-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from poslite.shared.infrastructure.migration_sql import enable_tenant_rls, grant_to_app_roles

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "device_imports",
        sa.Column("id", sa.CHAR(26), primary_key=True),
        sa.Column("tenant_id", sa.CHAR(26), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("device_id", sa.CHAR(26), sa.ForeignKey("devices.id"), nullable=False),
        sa.Column("imported_by", sa.CHAR(26), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("file_sha256", sa.CHAR(64), nullable=False),
        sa.Column("accepted", sa.Integer(), nullable=False),
        sa.Column("duplicate", sa.Integer(), nullable=False),
        sa.Column("flagged", sa.Integer(), nullable=False),
        sa.Column("rejected", postgresql.JSONB(), nullable=False),  # [{id, code}]
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_device_imports_device", "device_imports", ["device_id", "created_at"])
    for statement in [*enable_tenant_rls("device_imports"), *grant_to_app_roles("device_imports")]:
        op.execute(statement)


def downgrade() -> None:
    op.drop_table("device_imports")
