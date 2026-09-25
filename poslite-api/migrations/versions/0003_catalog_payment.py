"""Catalog and payment master data.

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-25
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from poslite.shared.infrastructure.migration_sql import (
    enable_tenant_rls,
    grant_to_app_roles,
    sync_version_trigger,
)

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _base() -> list[sa.Column[object]]:
    return [
        sa.Column("id", sa.CHAR(26), primary_key=True),
        sa.Column("tenant_id", sa.CHAR(26), sa.ForeignKey("tenants.id"), nullable=False),
    ]


def _master() -> list[sa.Column[object]]:
    return [
        sa.Column("version", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
    ]


def _secure(table: str, *, master: bool = True) -> None:
    statements = [*enable_tenant_rls(table), *grant_to_app_roles(table)]
    if master:
        statements += sync_version_trigger(table)
    for statement in statements:
        op.execute(statement)


def upgrade() -> None:
    op.create_table(
        "categories",
        *_base(),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("color", sa.String(20), nullable=False, server_default=""),
        sa.Column("print_role", sa.String(20), nullable=False, server_default="receipt"),
        *_master(),
        sa.CheckConstraint("print_role IN ('receipt', 'kitchen', 'bar')", name="print_role"),
    )
    _secure("categories")

    op.create_table(
        "products",
        *_base(),
        sa.Column("category_id", sa.CHAR(26), sa.ForeignKey("categories.id"), nullable=False),
        sa.Column("sku", sa.String(50), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("image_url", sa.Text()),
        sa.Column("price", sa.BigInteger(), nullable=False),
        sa.Column("is_available", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_master(),
        sa.CheckConstraint("price >= 0", name="price_non_negative"),
    )
    # Unique SKU among live products of a tenant (a deleted SKU can be reused).
    op.create_index(
        "uq_products_tenant_sku",
        "products",
        ["tenant_id", "sku"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    _secure("products")

    op.create_table(
        "modifier_groups",
        *_base(),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("min_select", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("max_select", sa.SmallInteger(), nullable=False, server_default="1"),
        *_master(),
        sa.CheckConstraint(
            "min_select >= 0 AND max_select >= 1 AND min_select <= max_select",
            name="selection_range",
        ),
    )
    _secure("modifier_groups")

    op.create_table(
        "modifier_options",
        *_base(),
        sa.Column(
            "modifier_group_id", sa.CHAR(26), sa.ForeignKey("modifier_groups.id"), nullable=False
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("price", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        *_master(),
        sa.CheckConstraint("price >= 0", name="price_non_negative"),
    )
    _secure("modifier_options")

    # Link table: no version of its own — changes touch products.version (ADR-009).
    op.create_table(
        "product_modifier_group",
        sa.Column("tenant_id", sa.CHAR(26), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("product_id", sa.CHAR(26), sa.ForeignKey("products.id"), primary_key=True),
        sa.Column(
            "modifier_group_id", sa.CHAR(26), sa.ForeignKey("modifier_groups.id"), primary_key=True
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )
    _secure("product_modifier_group", master=False)

    op.create_table(
        "payment_methods",
        *_base(),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("logo_url", sa.Text()),
        sa.Column("requires_reference", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        *_master(),
        sa.CheckConstraint(
            "type IN ('cash', 'debit', 'qris', 'credit_card', 'voucher', 'other')", name="type"
        ),
    )
    _secure("payment_methods")


def downgrade() -> None:
    for table in (
        "payment_methods",
        "product_modifier_group",
        "modifier_options",
        "modifier_groups",
        "products",
        "categories",
    ):
        op.drop_table(table)
