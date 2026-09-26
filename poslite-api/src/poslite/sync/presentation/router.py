from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field

from poslite.catalog import api as catalog
from poslite.identity import api as identity
from poslite.organization import api as organization
from poslite.payment import api as payment
from poslite.shared.application.clock import Clock
from poslite.shared.application.sync import DeviceContext
from poslite.shared.presentation.dependencies import clock, open_uow
from poslite.shared.presentation.envelope import ApiResponse, ok
from poslite.shared.presentation.security import Principal, require_ability
from poslite.sync.application.events import IncomingEvent
from poslite.sync.application.pull_changes import merge_feeds
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


@router.get("/sync/pull", response_model_exclude_none=True)
async def pull(
    request: Request,
    principal: Annotated[Principal, Depends(require_ability("device:read"))],
    now: Annotated[Clock, Depends(clock)],
    cursor: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=500)] = 500,
) -> ApiResponse[PullResult]:
    """Delta pull of master data for the device's outlet (ADR-004, ADR-009)."""
    async with open_uow(request, principal.tenant_id) as uow:
        device = await organization.get_device(uow, principal.owner_id)
        feeds = [
            await organization.outlet_changes(
                uow, outlet_id=device.outlet.id, cursor=cursor, limit=limit
            ),
            *await catalog.catalog_changes(uow, cursor=cursor, limit=limit),
            await payment.payment_method_changes(uow, cursor=cursor, limit=limit),
            await identity.user_changes(
                uow, outlet_id=device.outlet.id, cursor=cursor, limit=limit
            ),
        ]
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
