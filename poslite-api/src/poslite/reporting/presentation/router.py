from datetime import date, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, Response, status
from pydantic import BaseModel, Field

from poslite.identity import api as identity
from poslite.organization import api as organization
from poslite.reporting.infrastructure.day_closings import close_day, day_status, list_day_closings
from poslite.reporting.infrastructure.export import to_csv, to_xlsx
from poslite.reporting.infrastructure.queries import bill_void_report, sales_summary
from poslite.shared.application.clock import Clock
from poslite.shared.domain.errors import DomainError
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork
from poslite.shared.presentation.dependencies import clock, open_uow
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
    # Bill items cancelled after the kitchen had them (ADR-028); never part of `net`.
    pre_payment_void_count: int
    pre_payment_void_amount: int


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


class ChannelSales(BaseModel):
    channel_id: str
    channel_name: str
    kind: str
    order_count: int
    gross: int
    net: int


class SalesSummaryOut(BaseModel):
    days: list[DaySales]
    totals: Totals
    payment_methods: list[PaymentMethodSales]
    products: list[ProductSales]
    categories: list[CategorySales]
    cashiers: list[CashierSales]
    channels: list[ChannelSales]  # ADR-029


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


class BillVoidLineOut(BaseModel):
    product_id: str
    product_name: str
    modifiers: list[str]
    unit_price: int
    quantity: int
    amount: int


class BillVoidOut(BaseModel):
    id: str
    outlet_id: str
    device_id: str
    shift_id: str
    business_date: date
    bill_id: str
    scope: Literal["line", "bill_cancelled"]
    table_label: str
    cashier_id: str
    cashier_name: str
    approved_by: str | None
    approver_name: str | None
    reason: str
    amount: int
    voided_at: datetime
    lines: list[BillVoidLineOut]


class BillVoidTotalsOut(BaseModel):
    count: int
    amount: int


class BillVoidReportOut(BaseModel):
    voids: list[BillVoidOut]
    totals: BillVoidTotalsOut


@router.get("/reports/bill-voids")
async def get_bill_voids(
    request: Request,
    principal: Annotated[Principal, Depends(require_ability("backoffice:read"))],
    start: Annotated[date, Query(alias="from")],
    end: Annotated[date, Query(alias="to")],
    scope: identity.Access,
    outlet_id: Annotated[Ulid | None, Query()] = None,
    brand_id: Annotated[Ulid | None, Query()] = None,
    brand: identity.BrandHeader = None,
) -> ApiResponse[BillVoidReportOut]:
    """Items cancelled from open bills after the kitchen had them (ADR-028), newest first."""
    if end < start:
        raise DomainError("INVALID_DATE_RANGE", "`to` must not be before `from`")
    async with open_uow(request, principal.tenant_id) as uow:
        outlets, _ = await _report_scope(
            uow, scope, outlet_id=outlet_id, brand_id=brand_id, active_brand=brand
        )
        result = await bill_void_report(uow, outlets, start, end)
    return ok(BillVoidReportOut.model_validate(result))


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


# ── Day closing (ADR-026) ───────────────────────────────────────────────────────────────────


class DayClosingRowOut(BaseModel):
    id: str
    outlet_id: str
    business_date: date
    closed_by: str
    closed_by_name: str
    closed_at: datetime
    notes: str


class DayCashOut(BaseModel):
    shift_count: int
    open_shift_count: int
    opening_cash: int
    expected_cash: int  # closed shifts only
    counted_cash: int
    variance: int


class StaleDeviceOut(BaseModel):
    id: str
    code: str
    name: str
    last_seen_at: datetime | None


class DayWarningOut(BaseModel):
    code: Literal["OPEN_SHIFTS", "DEVICES_NOT_SYNCED"]
    count: int | None = None  # OPEN_SHIFTS
    devices: list[StaleDeviceOut] | None = None  # DEVICES_NOT_SYNCED


class DaySnapshotOut(BaseModel):
    totals: Totals
    payment_methods: list[PaymentMethodSales]
    cash: DayCashOut
    warnings: list[DayWarningOut]


class DayClosingOut(DayClosingRowOut):
    snapshot: DaySnapshotOut  # 13-day-closing.md


class DayStatusOut(BaseModel):
    outlet_id: str
    business_date: date
    day_ended: bool
    current: DaySnapshotOut
    closing: DayClosingOut | None
    changed_since_close: bool


class CloseDayIn(BaseModel):
    outlet_id: Ulid
    business_date: date
    notes: str = Field(default="", max_length=500)


async def _outlet_in_scope(
    uow: SqlAlchemyUnitOfWork, scope: identity.AccessScope, outlet_id: str, brand: str | None
) -> None:
    outlet = await organization.get_outlet(uow, outlet_id)
    identity.ensure_outlet(scope, outlet_id=outlet.id, brand_id=outlet.brand_id, active_brand=brand)


@router.get("/day-closings/day")
async def get_day_status(
    request: Request,
    principal: Annotated[Principal, Depends(require_ability("backoffice:read"))],
    scope: identity.Access,
    system_clock: Annotated[Clock, Depends(clock)],
    outlet_id: Annotated[Ulid, Query()],
    business_date: Annotated[date, Query()],
    brand: identity.BrandHeader = None,
) -> ApiResponse[DayStatusOut]:
    async with open_uow(request, principal.tenant_id) as uow:
        await _outlet_in_scope(uow, scope, outlet_id, brand)
        result = await day_status(uow, outlet_id, business_date, now=system_clock.now())
    return ok(DayStatusOut.model_validate(result, from_attributes=True))


@router.post("/day-closings", status_code=status.HTTP_201_CREATED)
async def post_day_closing(
    body: CloseDayIn,
    request: Request,
    principal: Annotated[Principal, Depends(require_ability("backoffice:write"))],
    scope: identity.Access,
    system_clock: Annotated[Clock, Depends(clock)],
    brand: identity.BrandHeader = None,
) -> ApiResponse[DayClosingOut]:
    async with open_uow(request, principal.tenant_id) as uow:
        await _outlet_in_scope(uow, scope, body.outlet_id, brand)
        closing = await close_day(
            uow,
            body.outlet_id,
            body.business_date,
            closed_by=principal.owner_id,
            notes=body.notes.strip(),
            now=system_clock.now(),
        )
        await uow.commit()
    return ok(DayClosingOut.model_validate(closing, from_attributes=True))


@router.get("/day-closings")
async def get_day_closings(
    request: Request,
    principal: Annotated[Principal, Depends(require_ability("backoffice:read"))],
    scope: identity.Access,
    outlet_id: Annotated[Ulid, Query()],
    start: Annotated[date, Query(alias="from")],
    end: Annotated[date, Query(alias="to")],
    brand: identity.BrandHeader = None,
) -> ApiResponse[list[DayClosingRowOut]]:
    if end < start:
        raise DomainError("INVALID_DATE_RANGE", "`to` must not be before `from`")
    async with open_uow(request, principal.tenant_id) as uow:
        await _outlet_in_scope(uow, scope, outlet_id, brand)
        rows = await list_day_closings(uow, outlet_id, start, end)
    return ok([DayClosingRowOut.model_validate(r, from_attributes=True) for r in rows])
