"""Orders on sales channels (ADR-029): the channel and the delivery app's order number on every
order, older orders backfilled from order_type, and the daily read model per channel.

Revision ID: 0026
Revises: 0025
Create Date: 2026-10-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from poslite.shared.infrastructure.migration_sql import (
    enable_tenant_rls,
    fill_brand_trigger,
    grant_to_app_roles,
)

revision: str = "0026"
down_revision: str | None = "0025"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "orders", sa.Column("channel_id", sa.CHAR(26), sa.ForeignKey("sales_channels.id"))
    )
    op.add_column("orders", sa.Column("external_ref", sa.String(50)))

    # Older orders sold at a table or over the counter: the brand's seeded channel of that kind.
    conn = op.get_bind()
    for (tenant_id,) in conn.execute(sa.text("SELECT id FROM tenants")).all():
        conn.execute(sa.text("SELECT set_config('app.tenant_id', :t, true)"), {"t": tenant_id})
        conn.execute(
            sa.text(
                "UPDATE orders o SET channel_id = c.id FROM sales_channels c"
                " WHERE o.channel_id IS NULL AND c.brand_id = o.brand_id"
                " AND c.code = CASE o.order_type WHEN 'dine_in' THEN 'DINE_IN' ELSE 'TAKE_AWAY' END"
                " AND c.deleted_at IS NULL"
            )
        )
    conn.execute(sa.text("SELECT set_config('app.tenant_id', '', true)"))

    op.create_table(
        "rpt_daily_channel_sales",
        sa.Column("tenant_id", sa.CHAR(26), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("outlet_id", sa.CHAR(26), sa.ForeignKey("outlets.id"), primary_key=True),
        sa.Column("business_date", sa.Date(), primary_key=True),
        sa.Column("channel_id", sa.CHAR(26), primary_key=True),
        sa.Column("brand_id", sa.CHAR(26)),  # copied from the outlet (trigger)
        sa.Column("order_count", sa.Integer(), nullable=False),
        sa.Column("gross", sa.BigInteger(), nullable=False),
        sa.Column("net", sa.BigInteger(), nullable=False),
    )
    for statement in [
        *enable_tenant_rls("rpt_daily_channel_sales"),
        *grant_to_app_roles("rpt_daily_channel_sales"),
    ]:
        op.execute(statement)
    op.execute(fill_brand_trigger("rpt_daily_channel_sales"))


def downgrade() -> None:
    op.drop_table("rpt_daily_channel_sales")
    op.drop_column("orders", "external_ref")
    op.drop_column("orders", "channel_id")
