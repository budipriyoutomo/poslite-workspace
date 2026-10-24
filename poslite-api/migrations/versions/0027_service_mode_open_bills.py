"""Service mode per outlet and shared open bills (ADR-031): a table-service outlet keeps its unpaid
bills on the server, versioned, with a short lease for the one device editing a bill; and the
waiter role, who takes orders but never takes money.

Revision ID: 0027
Revises: 0026
Create Date: 2026-10-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

from poslite.shared.infrastructure.migration_sql import enable_tenant_rls, grant_to_app_roles

revision: str = "0027"
down_revision: str | None = "0026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ULID = sa.CHAR(26)
WAITER = 4  # after owner, manager, cashier (0002)


def upgrade() -> None:
    op.add_column(
        "outlets",
        sa.Column("service_mode", sa.String(20), nullable=False, server_default="counter"),
    )
    op.create_check_constraint(
        "ck_outlets_service_mode", "outlets", "service_mode IN ('counter', 'table_service')"
    )

    # Not master data: devices poll the open ones (ADR-031), so no sync version trigger. `version`
    # is the bill's own optimistic lock. Lines are the device's cart lines, stored as sent.
    op.create_table(
        "open_bills",
        sa.Column("id", ULID, primary_key=True),
        sa.Column("tenant_id", ULID, sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("outlet_id", ULID, sa.ForeignKey("outlets.id"), nullable=False),
        sa.Column("table_id", ULID, sa.ForeignKey("dining_tables.id")),
        sa.Column("table_label", sa.String(30), nullable=False),
        sa.Column("lines", JSONB(), nullable=False),
        sa.Column("discount", JSONB()),
        sa.Column("opened_by", ULID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("lease_device_id", ULID, sa.ForeignKey("devices.id")),
        sa.Column("lease_user_id", ULID, sa.ForeignKey("users.id")),
        sa.Column("lease_until", sa.DateTime(timezone=True)),
        sa.Column("closed_at", sa.DateTime(timezone=True)),
        sa.Column("closed_by_order_id", ULID),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index(
        "ix_open_bills_outlet_open",
        "open_bills",
        ["tenant_id", "outlet_id"],
        postgresql_where=sa.text("closed_at IS NULL"),
    )
    op.create_index(
        "uq_open_bills_table",
        "open_bills",
        ["tenant_id", "table_id"],
        unique=True,
        postgresql_where=sa.text("closed_at IS NULL AND table_id IS NOT NULL"),
    )
    for statement in [*enable_tenant_rls("open_bills"), *grant_to_app_roles("open_bills")]:
        op.execute(statement)

    # The waiter has no permissions: no shift close, cash movement, void, or discount override.
    op.execute(f"INSERT INTO roles (id, name) VALUES ({WAITER}, 'waiter')")
    op.create_check_constraint(
        "ck_user_assignments_waiter_not_company",
        "user_assignments",
        f"role_id <> {WAITER} OR scope_type <> 'company'",
    )


def downgrade() -> None:
    # Waiters lose their outlets (the role did not exist before). RLS is forced: per tenant.
    conn = op.get_bind()
    for (tenant_id,) in conn.execute(sa.text("SELECT id FROM tenants")).all():
        conn.execute(sa.text("SELECT set_config('app.tenant_id', :t, true)"), {"t": tenant_id})
        conn.execute(sa.text(f"DELETE FROM user_assignments WHERE role_id = {WAITER}"))
    conn.execute(sa.text("SELECT set_config('app.tenant_id', '', true)"))
    op.drop_constraint("ck_user_assignments_waiter_not_company", "user_assignments")
    op.execute(f"DELETE FROM roles WHERE id = {WAITER}")
    op.drop_table("open_bills")
    op.drop_constraint("ck_outlets_service_mode", "outlets")
    op.drop_column("outlets", "service_mode")
