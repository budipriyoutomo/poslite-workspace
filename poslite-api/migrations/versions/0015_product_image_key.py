"""Product images live in object storage (ADR-021): products keep the object key, not a URL.

Existing values are kept; a value that is already a full URL is served as-is.

Revision ID: 0015
Revises: 0014
Create Date: 2026-09-29
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("products", "image_url", new_column_name="image_key")


def downgrade() -> None:
    op.alter_column("products", "image_key", new_column_name="image_url")
