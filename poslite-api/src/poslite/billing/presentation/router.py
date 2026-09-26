from typing import Annotated

from fastapi import APIRouter, Depends, Request

from poslite.billing.application.schemas import SubscriptionOut
from poslite.billing.infrastructure.service import subscription_view
from poslite.shared.presentation.dependencies import open_uow
from poslite.shared.presentation.envelope import ApiResponse, ok
from poslite.shared.presentation.security import Principal, require_ability

router = APIRouter(tags=["billing"])


@router.get("/billing/subscription")
async def subscription(
    request: Request, principal: Annotated[Principal, Depends(require_ability("backoffice:read"))]
) -> ApiResponse[SubscriptionOut | None]:
    """Trial, current period and invoices (ADR-018); null until the daily billing job first runs."""
    async with open_uow(request, principal.tenant_id) as uow:
        return ok(await subscription_view(uow))
