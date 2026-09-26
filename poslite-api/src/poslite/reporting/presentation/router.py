from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel

from poslite.organization import api as organization
from poslite.reporting.infrastructure.queries import sales_summary
from poslite.shared.domain.errors import DomainError
from poslite.shared.presentation.dependencies import open_uow
from poslite.shared.presentation.envelope import ApiResponse, ok
from poslite.shared.presentation.schemas import Ulid
from poslite.shared.presentation.security import Principal, require_ability

router = APIRouter(tags=["reporting"])


class SalesSummaryOut(BaseModel):
    days: list[dict[str, object]]
    totals: dict[str, int]
    payment_methods: list[dict[str, object]]
    products: list[dict[str, object]]


@router.get("/reports/sales-summary")
async def get_sales_summary(
    request: Request,
    principal: Annotated[Principal, Depends(require_ability("backoffice:read"))],
    outlet_id: Annotated[Ulid, Query()],
    start: Annotated[date, Query(alias="from")],
    end: Annotated[date, Query(alias="to")],
) -> ApiResponse[SalesSummaryOut]:
    if end < start:
        raise DomainError("INVALID_DATE_RANGE", "`to` must not be before `from`")
    async with open_uow(request, principal.tenant_id) as uow:
        await organization.get_outlet(uow, outlet_id)
        result = await sales_summary(uow, outlet_id, start, end)
    return ok(
        SalesSummaryOut(
            days=result.days,
            totals=result.totals,
            payment_methods=result.payment_methods,
            products=result.products,
        )
    )
