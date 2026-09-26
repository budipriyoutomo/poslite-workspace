"""Platform operators (SaaS staff): global tables, reachable only by poslite_system.

They belong to no tenant (api_tokens.tenant_id is NOT NULL), so they get their own token table.
poslite_app has no privileges on either table.

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "platform_admins",
        sa.Column("id", sa.CHAR(26), primary_key=True),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index(
        "uq_platform_admins_email", "platform_admins", [sa.text("lower(email)")], unique=True
    )
    op.create_table(
        "platform_tokens",
        sa.Column("id", sa.CHAR(26), primary_key=True),
        sa.Column("admin_id", sa.CHAR(26), sa.ForeignKey("platform_admins.id"), nullable=False),
        sa.Column("token_hash", sa.CHAR(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    for table in ("platform_admins", "platform_tokens"):
        op.execute(f"GRANT SELECT, INSERT, UPDATE ON {table} TO poslite_system")


def downgrade() -> None:
    op.drop_table("platform_tokens")
    op.drop_table("platform_admins")
