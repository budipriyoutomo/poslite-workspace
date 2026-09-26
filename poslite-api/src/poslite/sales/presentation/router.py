from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel

from poslite.organization import api as organization
from poslite.sales.infrastructure.queries import list_orders
from poslite.shared.presentation.dependencies import open_uow
from poslite.shared.presentation.envelope import ApiResponse, ok
from poslite.shared.presentation.schemas import Ulid
from poslite.shared.presentation.security import Principal, require_ability

router = APIRouter(tags=["sales"])


class OrderOut(BaseModel):
    id: str
    receipt_no: str
    business_date: date
    cashier_id: str
    total: int
    status: str
    flags: list[str]
    created_at: datetime


@router.get("/orders")
async def orders(
    request: Request,
    principal: Annotated[Principal, Depends(require_ability("backoffice:read"))],
    outlet_id: Annotated[Ulid, Query()],
    business_date: Annotated[date, Query()],
) -> ApiResponse[list[OrderOut]]:
    """Orders of one outlet and business day (back-office; devices only push)."""
    async with open_uow(request, principal.tenant_id) as uow:
        await organization.get_outlet(uow, outlet_id)
        rows = await list_orders(uow, outlet_id, business_date)
    return ok([OrderOut.model_validate(o, from_attributes=True) for o in rows])
