from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel

from poslite.identity import api as identity
from poslite.organization import api as organization
from poslite.reporting.infrastructure.export import to_csv, to_xlsx
from poslite.reporting.infrastructure.queries import sales_summary
from poslite.shared.domain.errors import DomainError
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork
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
    refund_amount: int  # paid out that day (ADR-023); `net` is sales, not reduced by refunds
    refund_count: int


class DaySales(Totals):
    business_date: date


class PaymentMethodSales(BaseModel):
    payment_method_id: str
    method_type: str
    amount: int
    count: int
    refund_amount: int


class ProductSales(BaseModel):
    product_id: str
    product_name: str
    quantity: int
    gross: int
    refund_qty: int
    refund_amount: int


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


async def _report_scope(
    uow: SqlAlchemyUnitOfWork,
    scope: identity.AccessScope,
    *,
    outlet_id: str | None,
    brand_id: str | None,
    active_brand: str | None,
) -> tuple[list[str], str]:
    """Outlets a report covers and a label for its file name (ADR-022): one outlet, the outlets
    of a brand, or every outlet the user may see (the whole company for company scope)."""
    if brand_id is not None and not scope.can_read_brand(brand_id):
        raise DomainError("BRAND_FORBIDDEN", "Brand is outside your access", kind="forbidden")
    if outlet_id is not None:
        outlet = await organization.get_outlet(uow, outlet_id)
        identity.ensure_outlet(
            scope,
            outlet_id=outlet.id,
            brand_id=outlet.brand_id,
            active_brand=brand_id or active_brand,
        )
        return [outlet.id], outlet.code
    outlets = [
        o.id
        for o in await organization.list_outlets(uow)
        if scope.can_access_outlet(outlet_id=o.id, brand_id=o.brand_id)
        and brand_id in (None, o.brand_id)
    ]
    label = (await organization.get_brand(uow, brand_id)).code if brand_id else "semua"
    return outlets, label


@router.get("/reports/sales-summary")
async def get_sales_summary(
    request: Request,
    principal: Annotated[Principal, Depends(require_ability("backoffice:read"))],
    start: Annotated[date, Query(alias="from")],
    end: Annotated[date, Query(alias="to")],
    scope: identity.Access,
    outlet_id: Annotated[Ulid | None, Query()] = None,
    brand_id: Annotated[Ulid | None, Query()] = None,
    brand: identity.BrandHeader = None,
) -> ApiResponse[SalesSummaryOut]:
    """No filter = every outlet in the user's scope; `brand_id` / `outlet_id` narrow it."""
    if end < start:
        raise DomainError("INVALID_DATE_RANGE", "`to` must not be before `from`")
    async with open_uow(request, principal.tenant_id) as uow:
        outlets, _ = await _report_scope(
            uow, scope, outlet_id=outlet_id, brand_id=brand_id, active_brand=brand
        )
        result = await sales_summary(uow, outlets, start, end)
    return ok(SalesSummaryOut.model_validate(result, from_attributes=True))


EXPORTS = {
    "csv": ("text/csv; charset=utf-8", to_csv),
    "xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", to_xlsx),
}


@router.get("/reports/sales-summary/export")
async def export_sales_summary(
    request: Request,
    principal: Annotated[Principal, Depends(require_ability("backoffice:read"))],
    start: Annotated[date, Query(alias="from")],
    end: Annotated[date, Query(alias="to")],
    scope: identity.Access,
    outlet_id: Annotated[Ulid | None, Query()] = None,
    brand_id: Annotated[Ulid | None, Query()] = None,
    file_format: Annotated[Literal["csv", "xlsx"], Query(alias="format")] = "csv",
    brand: identity.BrandHeader = None,
) -> Response:
    if end < start:
        raise DomainError("INVALID_DATE_RANGE", "`to` must not be before `from`")
    async with open_uow(request, principal.tenant_id) as uow:
        outlets, label = await _report_scope(
            uow, scope, outlet_id=outlet_id, brand_id=brand_id, active_brand=brand
        )
        result = await sales_summary(uow, outlets, start, end)
    media_type, render = EXPORTS[file_format]
    filename = f"penjualan-{label}-{start}-{end}.{file_format}"
    return Response(
        render(result),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
