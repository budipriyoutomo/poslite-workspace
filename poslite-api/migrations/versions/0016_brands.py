"""Company → Brand → Outlet (ADR-022): brands, brand_id on brand-owned and transaction tables,
user_assignments instead of outlet_user.

Every existing tenant gets one brand "Utama" that owns all its outlets and master data. Owners
become one `company` assignment; other outlet roles become `outlet` assignments. Data is moved
per tenant with `app.tenant_id` set, because RLS is forced on the owner role too (ADR-013).

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-07
"""

import re
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY

from poslite.shared.domain.ids import new_ulid
from poslite.shared.infrastructure.migration_sql import (
    FILL_BRAND_FUNCTION,
    enable_tenant_rls,
    fill_brand_trigger,
    grant_to_app_roles,
    sync_version_trigger,
)

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Brand-owned master data: brand_id is set by the application.
MASTER_TABLES = ("categories", "products", "modifier_groups", "promotions")
# Transaction and read-model rows: brand_id is copied from the outlet by a trigger.
OUTLET_TABLES = (
    "shifts",
    "orders",
    "rpt_daily_sales",
    "rpt_daily_product_sales",
    "rpt_daily_payment_sales",
    "rpt_daily_category_sales",
    "rpt_daily_cashier_sales",
)
OWNER, CASHIER = 1, 3  # role ids seeded by 0002


def brand_code(slug: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", slug.upper())[:20] or "UTAMA"


def _set_tenant(conn: sa.Connection, tenant_id: str) -> None:
    conn.execute(sa.text("SELECT set_config('app.tenant_id', :t, true)"), {"t": tenant_id})


def upgrade() -> None:
    op.create_table(
        "brands",
        sa.Column("id", sa.CHAR(26), primary_key=True),
        sa.Column("tenant_id", sa.CHAR(26), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("logo_key", sa.Text()),
        sa.Column("receipt_header", sa.Text(), nullable=False, server_default=""),
        sa.Column("receipt_footer", sa.Text(), nullable=False, server_default=""),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("version", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
    )
    op.create_index(
        "uq_brands_tenant_code",
        "brands",
        ["tenant_id", sa.text("lower(code)")],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    for statement in [
        *enable_tenant_rls("brands"),
        *sync_version_trigger("brands"),
        *grant_to_app_roles("brands"),
    ]:
        op.execute(statement)

    for table in ("outlets", *MASTER_TABLES, *OUTLET_TABLES):
        op.add_column(table, sa.Column("brand_id", sa.CHAR(26)))
    op.add_column(
        "webhook_endpoints",
        sa.Column("brand_ids", ARRAY(sa.CHAR(26)), nullable=False, server_default="{}"),
    )

    op.create_table(
        "user_assignments",
        sa.Column("id", sa.CHAR(26), primary_key=True),
        sa.Column("tenant_id", sa.CHAR(26), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("user_id", sa.CHAR(26), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role_id", sa.SmallInteger(), sa.ForeignKey("roles.id"), nullable=False),
        sa.Column("scope_type", sa.String(10), nullable=False),
        sa.Column("brand_id", sa.CHAR(26), sa.ForeignKey("brands.id")),
        sa.Column("outlet_id", sa.CHAR(26)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint(
            "(scope_type = 'company' AND brand_id IS NULL AND outlet_id IS NULL)"
            " OR (scope_type = 'brand' AND brand_id IS NOT NULL AND outlet_id IS NULL)"
            " OR (scope_type = 'outlet' AND brand_id IS NOT NULL AND outlet_id IS NOT NULL)",
            name="scope",
        ),
        # Owners see the whole company; cashiers work at a brand or an outlet (doc 10).
        sa.CheckConstraint(f"role_id <> {OWNER} OR scope_type = 'company'", name="owner_company"),
        sa.CheckConstraint(
            f"role_id <> {CASHIER} OR scope_type <> 'company'", name="cashier_not_company"
        ),
    )
    op.create_index("ix_user_assignments_user", "user_assignments", ["user_id"])
    for statement in [
        *enable_tenant_rls("user_assignments"),
        *grant_to_app_roles("user_assignments"),
    ]:
        op.execute(statement)

    _move_data()

    for table in ("outlets", *MASTER_TABLES, *OUTLET_TABLES):
        op.alter_column(table, "brand_id", nullable=False)
    for table in ("outlets", *MASTER_TABLES):
        op.create_foreign_key(f"fk_{table}_brand", table, "brands", ["brand_id"], ["id"])
    for table in ("shifts", "orders"):
        op.create_index(
            f"ix_{table}_brand_business_date", table, ["tenant_id", "brand_id", "business_date"]
        )
    for table in OUTLET_TABLES[2:]:
        op.create_index(f"ix_{table}_brand", table, ["tenant_id", "brand_id", "business_date"])

    # An outlet assignment must name the outlet's own brand.
    op.create_unique_constraint("uq_outlets_id_brand", "outlets", ["id", "brand_id"])
    op.create_foreign_key(
        "fk_user_assignments_outlet_brand",
        "user_assignments",
        "outlets",
        ["outlet_id", "brand_id"],
        ["id", "brand_id"],
    )
    op.execute(
        "ALTER TABLE user_assignments ADD CONSTRAINT uq_user_assignments_scope"
        " UNIQUE NULLS NOT DISTINCT (tenant_id, user_id, scope_type, brand_id, outlet_id)"
    )

    op.drop_index("uq_products_tenant_sku", "products")
    op.create_index(
        "uq_products_brand_sku",
        "products",
        ["tenant_id", "brand_id", "sku"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.execute(FILL_BRAND_FUNCTION)
    for table in OUTLET_TABLES:
        op.execute(fill_brand_trigger(table))

    op.drop_table("outlet_user")


def _move_data() -> None:
    conn = op.get_bind()
    tenants = conn.execute(sa.text("SELECT id, slug FROM tenants ORDER BY created_at")).all()
    for tenant_id, slug in tenants:
        _set_tenant(conn, tenant_id)
        first = conn.execute(
            sa.text(
                "SELECT receipt_header, receipt_footer FROM outlets"
                " ORDER BY deleted_at IS NOT NULL, created_at LIMIT 1"
            )
        ).first()
        brand_id = new_ulid()
        conn.execute(
            sa.text(
                "INSERT INTO brands (id, tenant_id, code, name, receipt_header, receipt_footer)"
                " VALUES (:id, :t, :code, 'Utama', :header, :footer)"
            ),
            {
                "id": brand_id,
                "t": tenant_id,
                "code": brand_code(slug),
                "header": first.receipt_header if first else "",
                "footer": first.receipt_footer if first else "",
            },
        )
        for table in ("outlets", *MASTER_TABLES):
            conn.execute(sa.text(f"UPDATE {table} SET brand_id = :b"), {"b": brand_id})
        for table in OUTLET_TABLES:
            conn.execute(
                sa.text(
                    f"UPDATE {table} t SET brand_id = o.brand_id FROM outlets o"
                    " WHERE o.id = t.outlet_id"
                )
            )

        roles = conn.execute(sa.text("SELECT user_id, outlet_id, role_id FROM outlet_user")).all()
        owners = {user_id for user_id, _, role_id in roles if role_id == OWNER}
        rows = [
            {
                "user_id": u,
                "role_id": OWNER,
                "scope_type": "company",
                "brand_id": None,
                "outlet_id": None,
            }
            for u in sorted(owners)
        ] + [
            {
                "user_id": u,
                "role_id": r,
                "scope_type": "outlet",
                "brand_id": brand_id,
                "outlet_id": o,
            }
            for u, o, r in roles
            if u not in owners
        ]
        for row in rows:
            conn.execute(
                sa.text(
                    "INSERT INTO user_assignments"
                    " (id, tenant_id, user_id, role_id, scope_type, brand_id, outlet_id)"
                    " VALUES (:id, :t, :user_id, :role_id, :scope_type, :brand_id, :outlet_id)"
                ),
                {"id": new_ulid(), "t": tenant_id, **row},
            )
    _set_tenant(conn, "")


def downgrade() -> None:
    op.create_table(
        "outlet_user",
        sa.Column("tenant_id", sa.CHAR(26), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("outlet_id", sa.CHAR(26), sa.ForeignKey("outlets.id"), primary_key=True),
        sa.Column("user_id", sa.CHAR(26), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("role_id", sa.SmallInteger(), sa.ForeignKey("roles.id"), nullable=False),
    )
    for statement in [*enable_tenant_rls("outlet_user"), *grant_to_app_roles("outlet_user")]:
        op.execute(statement)

    # Highest role per outlet; company and brand assignments expand to their outlets.
    conn = op.get_bind()
    for (tenant_id,) in conn.execute(sa.text("SELECT id FROM tenants")).all():
        _set_tenant(conn, tenant_id)
        conn.execute(
            sa.text(
                "INSERT INTO outlet_user (tenant_id, outlet_id, user_id, role_id)"
                " SELECT DISTINCT ON (o.id, a.user_id) a.tenant_id, o.id, a.user_id, a.role_id"
                " FROM user_assignments a JOIN outlets o ON a.scope_type = 'company'"
                "   OR (a.scope_type = 'brand' AND o.brand_id = a.brand_id)"
                "   OR (a.scope_type = 'outlet' AND o.id = a.outlet_id)"
                " ORDER BY o.id, a.user_id, a.role_id"
            )
        )
    _set_tenant(conn, "")

    for table in OUTLET_TABLES:
        op.execute(f"DROP TRIGGER trg_{table}_fill_brand ON {table}")
    op.execute("DROP FUNCTION fill_brand_from_outlet()")
    op.drop_index("uq_products_brand_sku", "products")
    op.create_index(
        "uq_products_tenant_sku",
        "products",
        ["tenant_id", "sku"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.drop_table("user_assignments")
    op.drop_constraint("uq_outlets_id_brand", "outlets")
    op.drop_column("webhook_endpoints", "brand_ids")
    for table in ("outlets", *MASTER_TABLES, *OUTLET_TABLES):
        op.drop_column(table, "brand_id")
    op.drop_table("brands")
