"""Audit log of operator actions (ADR-025): who did what, to which tenant, when.

Rows are only inserted (poslite_system has no UPDATE/DELETE on the table). Never store secrets
in `detail` — a reset password is not recorded, only that it was reset."""

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.platform_admin.infrastructure.models import PlatformAuditModel
from poslite.shared.domain.ids import new_ulid


async def record(
    system: async_sessionmaker[AsyncSession],
    *,
    admin_id: str,
    action: str,
    tenant_id: str | None = None,
    target_id: str | None = None,
    detail: dict[str, Any] | None = None,
) -> None:
    async with system() as session, session.begin():
        session.add(
            PlatformAuditModel(
                id=new_ulid(),
                admin_id=admin_id,
                action=action,
                tenant_id=tenant_id,
                target_id=target_id,
                detail=detail or {},
            )
        )


@dataclass(frozen=True, slots=True)
class AuditEntry:
    id: str
    action: str
    operator_id: str
    operator_name: str
    tenant_id: str | None
    tenant_name: str | None
    target_id: str | None
    detail: dict[str, Any]
    created_at: datetime


_COUNT = (
    "SELECT count(*) FROM platform_audit_log l"
    " WHERE (CAST(:tenant_id AS text) IS NULL OR l.tenant_id = :tenant_id)"
)
_PAGE = (
    "SELECT l.id, l.action, l.admin_id, a.name, l.tenant_id, t.name, l.target_id,"
    " l.detail, l.created_at"
    " FROM platform_audit_log l"
    " JOIN platform_admins a ON a.id = l.admin_id"
    " LEFT JOIN tenants t ON t.id = l.tenant_id"
    " WHERE (CAST(:tenant_id AS text) IS NULL OR l.tenant_id = :tenant_id)"
    " ORDER BY l.created_at DESC, l.id DESC LIMIT :limit OFFSET :offset"
)


async def entries(
    system: async_sessionmaker[AsyncSession], *, tenant_id: str | None, limit: int, offset: int
) -> tuple[list[AuditEntry], int]:
    """Newest first (ULIDs break ties within one timestamp); optionally one tenant's entries."""
    params = {"tenant_id": tenant_id, "limit": limit, "offset": offset}
    async with system() as session:
        total = await session.scalar(text(_COUNT), params)
        rows = await session.execute(text(_PAGE), params)
        return [AuditEntry(*r) for r in rows], total or 0
