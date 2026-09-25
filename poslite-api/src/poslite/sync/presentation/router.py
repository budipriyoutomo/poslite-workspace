from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel

from poslite.catalog import api as catalog
from poslite.identity import api as identity
from poslite.organization import api as organization
from poslite.payment import api as payment
from poslite.shared.application.clock import Clock
from poslite.shared.presentation.dependencies import clock, open_uow
from poslite.shared.presentation.envelope import ApiResponse, ok
from poslite.shared.presentation.security import Principal, require_ability
from poslite.sync.application.pull_changes import merge_feeds

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
