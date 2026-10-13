"""Payment methods per outlet (doc 11 §3): which company payment methods each outlet takes.

Every existing method is switched on at every existing outlet, so nothing changes for devices
until the back-office turns a method off somewhere.

Revision ID: 0018
Revises: 0017
Create Date: 2026-10-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from poslite.shared.infrastructure.migration_sql import enable_tenant_rls, grant_to_app_roles

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Link table: no version of its own — changes touch payment_methods.version (ADR-009).
    op.create_table(
        "outlet_payment_method",
        sa.Column("tenant_id", sa.CHAR(26), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("outlet_id", sa.CHAR(26), sa.ForeignKey("outlets.id"), primary_key=True),
        sa.Column(
            "payment_method_id",
            sa.CHAR(26),
            sa.ForeignKey("payment_methods.id"),
            primary_key=True,
        ),
    )
    op.create_index(
        "ix_outlet_payment_method_method", "outlet_payment_method", ["payment_method_id"]
    )
    for statement in [
        *enable_tenant_rls("outlet_payment_method"),
        *grant_to_app_roles("outlet_payment_method"),
    ]:
        op.execute(statement)

    conn = op.get_bind()
    for (tenant_id,) in conn.execute(sa.text("SELECT id FROM tenants")).all():
        conn.execute(sa.text("SELECT set_config('app.tenant_id', :t, true)"), {"t": tenant_id})
        conn.execute(
            sa.text(
                "INSERT INTO outlet_payment_method (tenant_id, outlet_id, payment_method_id)"
                " SELECT :t, o.id, m.id FROM outlets o CROSS JOIN payment_methods m"
                " WHERE o.deleted_at IS NULL AND m.deleted_at IS NULL"
            ),
            {"t": tenant_id},
        )
    conn.execute(sa.text("SELECT set_config('app.tenant_id', '', true)"))


def downgrade() -> None:
    op.drop_table("outlet_payment_method")
