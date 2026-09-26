"""Per-outlet price and availability (outlet_products); changes re-version the product.

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from poslite.shared.infrastructure.migration_sql import enable_tenant_rls, grant_to_app_roles

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "outlet_products",
        sa.Column("tenant_id", sa.CHAR(26), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("outlet_id", sa.CHAR(26), sa.ForeignKey("outlets.id"), primary_key=True),
        sa.Column("product_id", sa.CHAR(26), sa.ForeignKey("products.id"), primary_key=True),
        sa.Column("price", sa.BigInteger()),  # NULL → the product's base price
        sa.Column("is_available", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.CheckConstraint("price IS NULL OR price >= 0", name="price_non_negative"),
    )
    for statement in [
        *enable_tenant_rls("outlet_products"),
        *grant_to_app_roles("outlet_products"),
    ]:
        op.execute(statement)


def downgrade() -> None:
    op.drop_table("outlet_products")
