import json
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, status
from pydantic import BaseModel, Field

from poslite.catalog import api as catalog
from poslite.identity import api as identity
from poslite.organization import api as organization
from poslite.payment import api as payment
from poslite.promotion import api as promotion
from poslite.shared.application.clock import Clock
from poslite.shared.application.sync import DeviceContext
from poslite.shared.domain.errors import DomainError
from poslite.shared.presentation.dependencies import clock, media_base_url, open_uow
from poslite.shared.presentation.envelope import ApiResponse, ok
from poslite.shared.presentation.security import Principal, require_ability
from poslite.sync.application.events import IncomingEvent
from poslite.sync.application.pull_changes import merge_feeds
from poslite.sync.domain.device_export import parse_export
from poslite.sync.infrastructure import imports
from poslite.sync.infrastructure.push import push_events

router = APIRouter(tags=["sync"])


class ChangeOut(BaseModel):
    entity: str
    op: Literal["upsert", "delete"]
    id: str
    version: int
    data: dict[str, object] | None = None


class PullResult(BaseModel):
    changes: list[ChangeOut]
    next_cursor: int
    has_more: bool
    server_time: datetime
    media_base_url: str  # device builds image URLs from it (ADR-021)


@router.get("/sync/pull", response_model_exclude_none=True)
async def pull(
    request: Request,
    principal: Annotated[Principal, Depends(require_ability("device:read"))],
    now: Annotated[Clock, Depends(clock)],
    base_url: Annotated[str, Depends(media_base_url)],
    cursor: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=500)] = 500,
) -> ApiResponse[PullResult]:
    """Delta pull of master data for the device's outlet (ADR-004, ADR-009)."""
    async with open_uow(request, principal.tenant_id) as uow:
        device = await organization.get_device(uow, principal.owner_id)
        await organization.touch_device(uow, device.id, request.headers.get("X-App-Version"))
        feeds = [
            await organization.outlet_changes(
                uow, outlet_id=device.outlet.id, cursor=cursor, limit=limit
            ),
            *await catalog.catalog_changes(
                uow,
                outlet_id=device.outlet.id,
                brand_id=device.outlet.brand_id,
                cursor=cursor,
                limit=limit,
            ),
            await payment.payment_method_changes(
                uow, outlet_id=device.outlet.id, cursor=cursor, limit=limit
            ),
            await organization.dining_table_changes(
                uow, outlet_id=device.outlet.id, cursor=cursor, limit=limit
            ),
            await catalog.channel_changes(
                uow, brand_id=device.outlet.brand_id, cursor=cursor, limit=limit
            ),
            await promotion.promotion_changes(
                uow,
                outlet_id=device.outlet.id,
                brand_id=device.outlet.brand_id,
                cursor=cursor,
                limit=limit,
            ),
            await identity.user_changes(
                uow,
                outlet_id=device.outlet.id,
                brand_id=device.outlet.brand_id,
                cursor=cursor,
                limit=limit,
            ),
        ]
        await uow.commit()  # keeps last_seen_at / app_version
    page = merge_feeds(feeds, cursor=cursor, limit=limit)
    return ok(
        PullResult(
            changes=[
                ChangeOut(entity=c.entity, op=c.op, id=c.id, version=c.version, data=c.data)
                for c in page.changes
            ],
            next_cursor=page.next_cursor,
            has_more=page.has_more,
            server_time=now.now(),
            media_base_url=base_url,
        )
    )


class PushRequest(BaseModel):
    events: Annotated[list[IncomingEvent], Field(min_length=1, max_length=50)]


class EventResultOut(BaseModel):
    id: str
    status: Literal["accepted", "flagged", "rejected", "duplicate"]
    flags: list[str] | None = None
    code: str | None = None
    message: str | None = None


class PushResult(BaseModel):
    results: list[EventResultOut]


@router.post("/sync/push", response_model_exclude_none=True)
async def push(
    body: PushRequest,
    request: Request,
    principal: Annotated[Principal, Depends(require_ability("device:sync"))],
) -> ApiResponse[PushResult]:
    """Idempotent push: one transaction per batch, a savepoint per event (ADR-010)."""
    async with open_uow(request, principal.tenant_id) as uow:
        device = await organization.get_device(uow, principal.owner_id)
        await organization.touch_device(uow, device.id, request.headers.get("X-App-Version"))
        ctx = DeviceContext(
            tenant_id=principal.tenant_id, device_id=device.id, outlet_id=device.outlet.id
        )
        results = await push_events(uow, ctx, body.events)
        await uow.commit()
    return ok(
        PushResult(
            results=[
                EventResultOut(
                    id=r.id,
                    status=r.status,
                    flags=list(r.flags) or None,
                    code=r.code,
                    message=r.message,
                )
                for r in results
            ]
        )
    )


# ── Emergency import (ADR-024) ─────────────────────────────────────────────────────────────

MAX_EXPORT_BYTES = 10 * 1024 * 1024


class RejectedEventOut(BaseModel):
    id: str
    code: str | None


class ImportOut(BaseModel):
    import_id: str
    device_id: str
    accepted: int
    duplicate: int
    flagged: int
    rejected: list[RejectedEventOut]
    created_at: datetime | None = None


@router.post(
    "/imports/device-export",
    status_code=status.HTTP_201_CREATED,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {"application/json": {"schema": {"type": "object"}}},
        }
    },
)
async def import_device_export(
    request: Request,
    principal: Annotated[Principal, Depends(require_ability("backoffice:write"))],
    scope: identity.Access,
) -> ApiResponse[ImportOut]:
    """A manager of the outlet pushes a device's export file for it (ADR-024). The file goes
    through the normal push path, so importing it twice changes nothing."""
    body = await request.body()
    if len(body) > MAX_EXPORT_BYTES:
        raise DomainError("EXPORT_INVALID", "Export files are at most 10 MB")
    try:
        raw = json.loads(body)
    except ValueError as err:
        raise DomainError("EXPORT_INVALID", "The export file is not JSON") from err
    export = parse_export(raw)
    if export.tenant_id is not None and export.tenant_id != principal.tenant_id:
        raise imports.wrong_tenant()
    async with open_uow(request, principal.tenant_id) as uow:
        outlet = await organization.get_outlet(uow, export.outlet_id)
        identity.ensure_outlet(scope, outlet_id=outlet.id, brand_id=outlet.brand_id)
        if not await identity.can_approve(
            uow,
            user_id=principal.owner_id,
            outlet_id=outlet.id,
            brand_id=outlet.brand_id,
            permission="sync.import",
        ):
            raise DomainError(
                "OUTLET_FORBIDDEN", "You cannot import for this outlet", kind="forbidden"
            )
        device = await organization.find_device(uow, export.device_id)
        if device is None or device.outlet.id != outlet.id:
            raise DomainError("EXPORT_DEVICE_UNKNOWN", "The device of this file is not known")
        ctx = DeviceContext(tenant_id=principal.tenant_id, device_id=device.id, outlet_id=outlet.id)
        result = await imports.import_export(uow, export, ctx=ctx, imported_by=principal.owner_id)
        await uow.commit()
    return ok(ImportOut.model_validate(result, from_attributes=True))


@router.get("/imports")
async def device_imports(
    request: Request,
    principal: Annotated[Principal, Depends(require_ability("backoffice:read"))],
    scope: identity.Access,
    device_id: Annotated[str, Query()],
) -> ApiResponse[list[ImportOut]]:
    async with open_uow(request, principal.tenant_id) as uow:
        device = await organization.find_device(uow, device_id)
        if device is None:
            raise DomainError("DEVICE_NOT_FOUND", "Device not found", kind="not_found")
        identity.ensure_outlet(scope, outlet_id=device.outlet.id, brand_id=device.outlet.brand_id)
        rows = await imports.list_imports(uow, device_id)
    return ok([ImportOut.model_validate(r, from_attributes=True) for r in rows])
