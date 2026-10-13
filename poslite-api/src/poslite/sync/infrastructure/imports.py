"""Import of an emergency device export (ADR-024) through the normal push path."""

from dataclasses import dataclass
from datetime import datetime

from pydantic import ValidationError
from sqlalchemy import select

from poslite.shared.application.sync import DeviceContext
from poslite.shared.domain.errors import DomainError
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork
from poslite.sync.application.events import IncomingEvent
from poslite.sync.application.push_events import EventResult
from poslite.sync.domain.device_export import DeviceExport
from poslite.sync.infrastructure.models import DeviceImportModel
from poslite.sync.infrastructure.push import push_events

CHUNK = 50


@dataclass(frozen=True, slots=True)
class ImportResult:
    import_id: str
    device_id: str
    accepted: int
    duplicate: int
    flagged: int
    rejected: list[dict[str, str | None]]
    created_at: datetime | None = None


def _incoming(raw: dict[str, object]) -> IncomingEvent | EventResult:
    try:
        return IncomingEvent.model_validate(raw)
    except ValidationError:
        return EventResult(str(raw.get("id")), "rejected", code="SCHEMA_INVALID")


async def import_export(
    uow: SqlAlchemyUnitOfWork, export: DeviceExport, *, ctx: DeviceContext, imported_by: str
) -> ImportResult:
    """Events in chunks of 50 through PushEventsHandler on behalf of the device that wrote them:
    same rules, flags and idempotency as a push, so a second import is all `duplicate`."""
    results: list[EventResult] = []
    parsed = [_incoming(e) for e in export.events]
    results += [r for r in parsed if isinstance(r, EventResult)]
    events = [e for e in parsed if isinstance(e, IncomingEvent)]
    for start in range(0, len(events), CHUNK):
        results += await push_events(uow, ctx, events[start : start + CHUNK])
    accepted, duplicate, flagged = (
        sum(r.status == s for r in results) for s in ("accepted", "duplicate", "flagged")
    )
    rejected: list[dict[str, str | None]] = [
        {"id": r.id, "code": r.code} for r in results if r.status == "rejected"
    ]
    row = DeviceImportModel(
        id=uow.new_id(),
        tenant_id=uow.tenant_id,
        device_id=ctx.device_id,
        imported_by=imported_by,
        file_sha256=export.checksum,
        accepted=accepted,
        duplicate=duplicate,
        flagged=flagged,
        rejected=rejected,
    )
    uow.session.add(row)
    await uow.session.flush()
    return ImportResult(row.id, ctx.device_id, accepted, duplicate, flagged, rejected)


async def list_imports(uow: SqlAlchemyUnitOfWork, device_id: str) -> list[ImportResult]:
    rows = await uow.session.scalars(
        select(DeviceImportModel)
        .where(DeviceImportModel.device_id == device_id)
        .order_by(DeviceImportModel.created_at.desc(), DeviceImportModel.id.desc())
    )
    return [
        ImportResult(
            r.id, r.device_id, r.accepted, r.duplicate, r.flagged, r.rejected, r.created_at
        )
        for r in rows
    ]


def wrong_tenant() -> DomainError:
    return DomainError("EXPORT_WRONG_TENANT", "This file belongs to another company")
