"""Cross-tenant read model of the operator console (ADR-025), queried as poslite_system.

Read-only by design: every change an operator makes goes through the owning module's api.py
(identity, billing, tenancy) so the module's rules apply. Without RLS here, every query below
filters by tenant itself."""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.shared.domain.errors import DomainError

# Role names by roles.id (identity: owner 1, manager 2, cashier 3), aggregated per user.
_ROLES = (
    "ARRAY(SELECT DISTINCT r.name FROM user_assignments ua JOIN roles r ON r.id = ua.role_id"
    " WHERE ua.user_id = u.id ORDER BY r.name)"
)


@dataclass(frozen=True, slots=True)
class TenantRow:
    id: str
    slug: str
    name: str
    status: str
    created_at: datetime
    suspended_at: datetime | None
    suspended_reason: str | None
    subscription_status: str | None
    outlet_count: int
    device_count: int


_TENANT_COLUMNS = """
    t.id, t.slug, t.name, t.status, t.created_at, t.suspended_at, t.suspended_reason,
    (SELECT s.status FROM subscriptions s WHERE s.tenant_id = t.id) AS subscription_status,
    (SELECT count(*) FROM outlets o
      WHERE o.tenant_id = t.id AND o.deleted_at IS NULL) AS outlet_count,
    (SELECT count(*) FROM devices d
      WHERE d.tenant_id = t.id AND d.revoked_at IS NULL) AS device_count
"""


def _like(q: str) -> str:
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


async def list_tenants(
    system: async_sessionmaker[AsyncSession],
    *,
    status: str | None,
    q: str | None,
    limit: int,
    offset: int,
) -> tuple[list[TenantRow], int]:
    """Newest first. `q` matches the name, the slug or the email of any of the tenant's users."""
    where = """
        WHERE (CAST(:status AS text) IS NULL OR t.status = :status)
          AND (CAST(:q AS text) IS NULL OR t.name ILIKE :q OR t.slug ILIKE :q
               OR EXISTS (SELECT 1 FROM users u WHERE u.tenant_id = t.id
                          AND u.deleted_at IS NULL AND u.email ILIKE :q))
    """
    params = {"status": status, "q": _like(q) if q else None, "limit": limit, "offset": offset}
    async with system() as session:
        total = await session.scalar(text(f"SELECT count(*) FROM tenants t {where}"), params)  # noqa: S608
        rows = await session.execute(
            text(
                f"SELECT {_TENANT_COLUMNS} FROM tenants t {where}"  # noqa: S608 — constant SQL
                " ORDER BY t.created_at DESC, t.id DESC LIMIT :limit OFFSET :offset"
            ),
            params,
        )
        return [TenantRow(*r) for r in rows], total or 0


@dataclass(frozen=True, slots=True)
class OwnerRow:
    name: str
    email: str | None


@dataclass(frozen=True, slots=True)
class OutletRow:
    id: str
    code: str
    name: str
    brand_name: str
    device_count: int


@dataclass(frozen=True, slots=True)
class UserRow:
    id: str
    name: str
    email: str | None
    roles: list[str]
    has_login: bool
    is_active: bool


@dataclass(frozen=True, slots=True)
class DeviceRow:
    id: str
    code: str
    name: str
    outlet_name: str
    platform: str
    app_version: str | None
    last_seen_at: datetime | None
    revoked_at: datetime | None


@dataclass(frozen=True, slots=True)
class TenantDetail:
    tenant: TenantRow
    owners: list[OwnerRow]
    outlets: list[OutletRow]
    users: list[UserRow]
    devices: list[DeviceRow]


async def tenant_row(session: AsyncSession, tenant_id: str) -> TenantRow:
    row = (
        await session.execute(
            text(f"SELECT {_TENANT_COLUMNS} FROM tenants t WHERE t.id = :id"),  # noqa: S608
            {"id": tenant_id},
        )
    ).first()
    if row is None:
        raise DomainError("TENANT_NOT_FOUND", "Tenant not found", kind="not_found")
    return TenantRow(*row)


async def tenant_detail(session: AsyncSession, tenant_id: str) -> TenantDetail:
    tenant = await tenant_row(session, tenant_id)
    ids = {"id": tenant_id}
    users = [
        UserRow(*r)
        for r in await session.execute(
            text(
                f"SELECT u.id, u.name, u.email, {_ROLES}, u.password_hash IS NOT NULL,"  # noqa: S608
                " u.is_active FROM users u"
                " WHERE u.tenant_id = :id AND u.deleted_at IS NULL ORDER BY u.name, u.id"
            ),
            ids,
        )
    ]
    outlets = await session.execute(
        text(
            "SELECT o.id, o.code, o.name, b.name,"
            " (SELECT count(*) FROM devices d WHERE d.outlet_id = o.id AND d.revoked_at IS NULL)"
            " FROM outlets o JOIN brands b ON b.id = o.brand_id"
            " WHERE o.tenant_id = :id AND o.deleted_at IS NULL ORDER BY o.code"
        ),
        ids,
    )
    devices = await session.execute(
        text(
            "SELECT d.id, d.code, d.name, o.name, d.platform, d.app_version, d.last_seen_at,"
            " d.revoked_at FROM devices d JOIN outlets o ON o.id = d.outlet_id"
            " WHERE d.tenant_id = :id ORDER BY d.revoked_at IS NOT NULL, o.code, d.code"
        ),
        ids,
    )
    return TenantDetail(
        tenant=tenant,
        owners=[OwnerRow(u.name, u.email) for u in users if "owner" in u.roles and u.is_active],
        outlets=[OutletRow(*r) for r in outlets],
        users=users,
        devices=[DeviceRow(*r) for r in devices],
    )


@dataclass(frozen=True, slots=True)
class UserHit:
    id: str
    name: str
    email: str | None
    roles: list[str]
    is_active: bool
    tenant_id: str
    tenant_name: str
    tenant_slug: str


async def search_users(
    system: async_sessionmaker[AsyncSession], *, q: str, limit: int
) -> list[UserHit]:
    """Users of every tenant whose name or email matches (support: "who is this caller?")."""
    async with system() as session:
        rows = await session.execute(
            text(
                f"SELECT u.id, u.name, u.email, {_ROLES}, u.is_active,"  # noqa: S608 — constant SQL
                " t.id, t.name, t.slug FROM users u JOIN tenants t ON t.id = u.tenant_id"
                " WHERE u.deleted_at IS NULL AND (u.name ILIKE :q OR u.email ILIKE :q)"
                " ORDER BY u.name, t.name, u.id LIMIT :limit"
            ),
            {"q": _like(q), "limit": limit},
        )
        return [UserHit(*r) for r in rows]


@dataclass(frozen=True, slots=True)
class Summary:
    tenants: int
    active_tenants: int
    suspended_tenants: int
    trialing: int
    paying: int
    past_due: int
    outlets: int
    devices: int
    monthly_recurring_revenue: int
    open_invoice_amount: int


async def summary(system: async_sessionmaker[AsyncSession]) -> Summary:
    """Platform at a glance. MRR = the latest invoice amount of every paying subscription."""
    async with system() as session:
        row = (
            await session.execute(
                text(
                    "SELECT"
                    " (SELECT count(*) FROM tenants),"
                    " (SELECT count(*) FROM tenants WHERE status = 'active'),"
                    " (SELECT count(*) FROM tenants WHERE status = 'suspended'),"
                    " (SELECT count(*) FROM subscriptions WHERE status = 'trialing'),"
                    " (SELECT count(*) FROM subscriptions WHERE status = 'active'),"
                    " (SELECT count(*) FROM subscriptions WHERE status = 'past_due'),"
                    " (SELECT count(*) FROM outlets WHERE deleted_at IS NULL),"
                    " (SELECT count(*) FROM devices WHERE revoked_at IS NULL),"
                    " (SELECT COALESCE(sum(latest.amount), 0) FROM subscriptions s"
                    "   CROSS JOIN LATERAL (SELECT i.amount FROM invoices i"
                    "     WHERE i.tenant_id = s.tenant_id AND i.status <> 'void'"
                    "     ORDER BY i.period_start DESC LIMIT 1) latest"
                    "   WHERE s.status = 'active'),"
                    " (SELECT COALESCE(sum(amount), 0) FROM invoices WHERE status = 'open')"
                )
            )
        ).one()
        return Summary(*(int(v) for v in row))
