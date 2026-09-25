"""Identity & organization: users, roles, outlets, devices, API tokens.

Revision ID: 0002
Revises: 0001
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

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ROLES = ["owner", "manager", "cashier"]
PERMISSIONS = ["order.void", "discount.override", "shift.close", "cash.move", "backoffice.manage"]
ROLE_PERMISSIONS = {
    "owner": PERMISSIONS,
    "manager": ["order.void", "discount.override", "shift.close", "cash.move", "backoffice.manage"],
    "cashier": ["shift.close", "cash.move"],
}


def _ulid_pk() -> sa.Column[str]:
    return sa.Column("id", sa.CHAR(26), primary_key=True)


def _tenant() -> sa.Column[str]:
    return sa.Column("tenant_id", sa.CHAR(26), sa.ForeignKey("tenants.id"), nullable=False)


def _master_columns() -> list[sa.Column[object]]:
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


def _secure(table: str, *, master: bool) -> None:
    statements = [*enable_tenant_rls(table), *grant_to_app_roles(table)]
    if master:
        statements += sync_version_trigger(table)
    for statement in statements:
        op.execute(statement)


def upgrade() -> None:
    # Global lookup tables (no tenant, no RLS), seeded here.
    op.create_table(
        "roles",
        sa.Column("id", sa.SmallInteger(), primary_key=True),
        sa.Column("name", sa.String(30), nullable=False, unique=True),
    )
    op.create_table(
        "permissions",
        sa.Column("id", sa.SmallInteger(), primary_key=True),
        sa.Column("name", sa.String(50), nullable=False, unique=True),
    )
    op.create_table(
        "role_permissions",
        sa.Column("role_id", sa.SmallInteger(), sa.ForeignKey("roles.id"), primary_key=True),
        sa.Column(
            "permission_id", sa.SmallInteger(), sa.ForeignKey("permissions.id"), primary_key=True
        ),
    )
    roles = sa.table("roles", sa.column("id", sa.SmallInteger()), sa.column("name", sa.String()))
    permissions = sa.table(
        "permissions", sa.column("id", sa.SmallInteger()), sa.column("name", sa.String())
    )
    role_permissions = sa.table(
        "role_permissions",
        sa.column("role_id", sa.SmallInteger()),
        sa.column("permission_id", sa.SmallInteger()),
    )
    op.bulk_insert(roles, [{"id": i + 1, "name": n} for i, n in enumerate(ROLES)])
    op.bulk_insert(permissions, [{"id": i + 1, "name": n} for i, n in enumerate(PERMISSIONS)])
    op.bulk_insert(
        role_permissions,
        [
            {"role_id": ROLES.index(r) + 1, "permission_id": PERMISSIONS.index(p) + 1}
            for r, ps in ROLE_PERMISSIONS.items()
            for p in ps
        ],
    )
    for table in ("roles", "permissions", "role_permissions"):
        op.execute(f"GRANT SELECT ON {table} TO poslite_app, poslite_system")

    op.create_table(
        "users",
        _ulid_pk(),
        _tenant(),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("email", sa.String(254)),
        sa.Column("password_hash", sa.Text()),
        sa.Column("pin_hash", sa.Text()),
        sa.Column("pin_salt", sa.Text()),
        sa.Column("pin_iterations", sa.Integer()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_master_columns(),
    )
    # Email is unique across tenants: it is the login identifier before a tenant is known.
    op.create_index(
        "uq_users_email",
        "users",
        [sa.text("lower(email)")],
        unique=True,
        postgresql_where=sa.text("email IS NOT NULL"),
    )
    _secure("users", master=True)

    op.create_table(
        "outlets",
        _ulid_pk(),
        _tenant(),
        sa.Column("code", sa.String(10), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("address", sa.Text(), nullable=False, server_default=""),
        sa.Column("phone", sa.String(30), nullable=False, server_default=""),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="Asia/Jakarta"),
        sa.Column("business_day_cutoff", sa.Time(), nullable=False, server_default="04:00"),
        sa.Column("tax_rate_bps", sa.Integer(), nullable=False, server_default="1000"),
        sa.Column("service_rate_bps", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("receipt_header", sa.Text(), nullable=False, server_default=""),
        sa.Column("receipt_footer", sa.Text(), nullable=False, server_default=""),
        *_master_columns(),
        sa.UniqueConstraint("tenant_id", "code"),
        sa.CheckConstraint(
            "tax_rate_bps >= 0 AND service_rate_bps >= 0", name="rates_non_negative"
        ),
    )
    _secure("outlets", master=True)

    op.create_table(
        "outlet_user",
        _tenant(),
        sa.Column("outlet_id", sa.CHAR(26), sa.ForeignKey("outlets.id"), primary_key=True),
        sa.Column("user_id", sa.CHAR(26), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("role_id", sa.SmallInteger(), sa.ForeignKey("roles.id"), nullable=False),
    )
    _secure("outlet_user", master=False)

    op.create_table(
        "devices",
        _ulid_pk(),
        _tenant(),
        sa.Column("outlet_id", sa.CHAR(26), sa.ForeignKey("outlets.id"), nullable=False),
        sa.Column("code", sa.String(3), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("platform", sa.String(30), nullable=False, server_default=""),
        sa.Column("app_version", sa.String(30)),
        sa.Column("last_seen_at", sa.DateTime(timezone=True)),
        sa.Column("activated_by", sa.CHAR(26), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("tenant_id", "outlet_id", "code"),
    )
    _secure("devices", master=False)

    op.create_table(
        "api_tokens",
        _ulid_pk(),
        _tenant(),
        sa.Column("owner_type", sa.String(20), nullable=False),
        sa.Column("owner_id", sa.CHAR(26), nullable=False),
        sa.Column("token_hash", sa.CHAR(64), nullable=False, unique=True),
        sa.Column("abilities", sa.dialects.postgresql.ARRAY(sa.String(50)), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True)),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("owner_type IN ('device', 'user', 'platform_admin')", name="owner_type"),
    )
    _secure("api_tokens", master=False)


def downgrade() -> None:
    for table in (
        "api_tokens",
        "devices",
        "outlet_user",
        "outlets",
        "users",
        "role_permissions",
        "permissions",
        "roles",
    ):
        op.drop_table(table)
