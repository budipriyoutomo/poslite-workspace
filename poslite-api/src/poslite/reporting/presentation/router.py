from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel

from poslite.organization import api as organization
from poslite.reporting.infrastructure.export import to_csv, to_xlsx
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
    categories: list[dict[str, object]]
    cashiers: list[dict[str, object]]


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
    return ok(SalesSummaryOut.model_validate(result, from_attributes=True))


EXPORTS = {
    "csv": ("text/csv; charset=utf-8", to_csv),
    "xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", to_xlsx),
}


@router.get("/reports/sales-summary/export")
async def export_sales_summary(
    request: Request,
    principal: Annotated[Principal, Depends(require_ability("backoffice:read"))],
    outlet_id: Annotated[Ulid, Query()],
    start: Annotated[date, Query(alias="from")],
    end: Annotated[date, Query(alias="to")],
    file_format: Annotated[Literal["csv", "xlsx"], Query(alias="format")] = "csv",
) -> Response:
    if end < start:
        raise DomainError("INVALID_DATE_RANGE", "`to` must not be before `from`")
    async with open_uow(request, principal.tenant_id) as uow:
        outlet = await organization.get_outlet(uow, outlet_id)
        result = await sales_summary(uow, outlet_id, start, end)
    media_type, render = EXPORTS[file_format]
    filename = f"penjualan-{outlet.code}-{start}-{end}.{file_format}"
    return Response(
        render(result),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
