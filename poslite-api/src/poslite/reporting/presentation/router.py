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


class Totals(BaseModel):
    gross: int
    discount: int
    service: int
    tax: int
    net: int
    order_count: int
    void_count: int


class DaySales(Totals):
    business_date: date


class PaymentMethodSales(BaseModel):
    payment_method_id: str
    method_type: str
    amount: int
    count: int


class ProductSales(BaseModel):
    product_id: str
    product_name: str
    quantity: int
    gross: int


class CategorySales(BaseModel):
    category_name: str
    quantity: int
    gross: int


class CashierSales(BaseModel):
    cashier_id: str
    cashier_name: str
    order_count: int
    net: int


class SalesSummaryOut(BaseModel):
    days: list[DaySales]
    totals: Totals
    payment_methods: list[PaymentMethodSales]
    products: list[ProductSales]
    categories: list[CategorySales]
    cashiers: list[CashierSales]


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
