"""Two-factor sign-in for operators (P1-8): a TOTP secret per operator, ten one-time recovery
codes, and challenge tokens that only open the second step, never the console.

Revision ID: 0031
Revises: 0030
Create Date: 2026-10-25
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0031"
down_revision: str | None = "0030"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("platform_admins", sa.Column("totp_secret", sa.Text()))
    op.add_column("platform_admins", sa.Column("totp_enabled_at", sa.DateTime(timezone=True)))
    # 'challenge': after the password only, valid for the second step; 'session': the console.
    op.add_column(
        "platform_tokens",
        sa.Column("stage", sa.String(10), nullable=False, server_default="session"),
    )
    op.create_table(
        "platform_recovery_codes",
        sa.Column("id", sa.CHAR(26), primary_key=True),
        sa.Column("admin_id", sa.CHAR(26), sa.ForeignKey("platform_admins.id"), nullable=False),
        sa.Column("code_hash", sa.CHAR(64), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_platform_recovery_codes_admin", "platform_recovery_codes", ["admin_id"])
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON platform_recovery_codes TO poslite_system")


def downgrade() -> None:
    op.drop_table("platform_recovery_codes")
    op.drop_column("platform_tokens", "stage")
    op.drop_column("platform_admins", "totp_enabled_at")
    op.drop_column("platform_admins", "totp_secret")
