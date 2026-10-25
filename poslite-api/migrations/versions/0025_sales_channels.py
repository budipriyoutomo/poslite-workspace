"""Sales channels (ADR-029): brand master data with a price mode, optional per-product prices, and
Dine In / Take Away seeded for every existing brand.

Revision ID: 0025
Revises: 0024
Create Date: 2026-10-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from poslite.shared.domain.ids import new_ulid
from poslite.shared.infrastructure.migration_sql import (
    enable_tenant_rls,
    grant_to_app_roles,
    sync_version_trigger,
)

revision: str = "0025"
down_revision: str | None = "0024"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ULID = sa.CHAR(26)
SEED = (("DINE_IN", "Dine In", "dine_in", 1), ("TAKE_AWAY", "Take Away", "take_away", 2))


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


def upgrade() -> None:
    op.create_table(
        "sales_channels",
        sa.Column("id", ULID, primary_key=True),
        sa.Column("tenant_id", ULID, sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("brand_id", ULID, sa.ForeignKey("brands.id"), nullable=False),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("price_mode", sa.String(20), nullable=False, server_default="base"),
        sa.Column("markup_bps", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("markup_rounding_unit", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("default_payment_method_id", ULID, sa.ForeignKey("payment_methods.id")),
        sa.Column("applies_service", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("applies_tax", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("requires_external_ref", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        *_master(),
        sa.CheckConstraint("kind IN ('dine_in', 'take_away', 'delivery')", name="kind"),
        sa.CheckConstraint("price_mode IN ('base', 'markup_bps', 'price_list')", name="price_mode"),
        sa.CheckConstraint("markup_bps >= 0 AND markup_rounding_unit >= 1", name="markup_positive"),
    )
    op.create_index(
        "uq_sales_channels_brand_code",
        "sales_channels",
        ["tenant_id", "brand_id", sa.text("upper(code)")],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    for statement in [
        *enable_tenant_rls("sales_channels"),
        *sync_version_trigger("sales_channels"),
        *grant_to_app_roles("sales_channels"),
    ]:
        op.execute(statement)

    # Link table: a change touches sales_channels.updated_at so devices pull the channel again.
    op.create_table(
        "channel_prices",
        sa.Column("tenant_id", ULID, sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("channel_id", ULID, sa.ForeignKey("sales_channels.id"), primary_key=True),
        sa.Column("product_id", ULID, sa.ForeignKey("products.id"), primary_key=True),
        sa.Column("price", sa.BigInteger(), nullable=False),
        sa.CheckConstraint("price >= 0", name="price_positive"),
    )
    for statement in [*enable_tenant_rls("channel_prices"), *grant_to_app_roles("channel_prices")]:
        op.execute(statement)

    # Every existing brand sells at its tables and over the counter, as before (ADR-029).
    conn = op.get_bind()
    for (tenant_id,) in conn.execute(sa.text("SELECT id FROM tenants")).all():
        conn.execute(sa.text("SELECT set_config('app.tenant_id', :t, true)"), {"t": tenant_id})
        brands = conn.execute(sa.text("SELECT id FROM brands")).scalars().all()
        for brand_id in brands:
            for code, name, kind, order in SEED:
                conn.execute(
                    sa.text(
                        "INSERT INTO sales_channels (id, tenant_id, brand_id, code, name, kind,"
                        " sort_order) VALUES (:id, :t, :b, :code, :name, :kind, :order)"
                    ),
                    {
                        "id": new_ulid(),
                        "t": tenant_id,
                        "b": brand_id,
                        "code": code,
                        "name": name,
                        "kind": kind,
                        "order": order,
                    },
                )
    conn.execute(sa.text("SELECT set_config('app.tenant_id', '', true)"))


def downgrade() -> None:
    op.drop_table("channel_prices")
    op.drop_table("sales_channels")
