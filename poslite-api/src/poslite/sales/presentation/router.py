from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel

from poslite.identity import api as identity
from poslite.organization import api as organization
from poslite.sales.infrastructure.queries import (
    list_orders,
    list_refunds,
    order_detail,
    order_id_by_receipt,
    refund_detail,
)
from poslite.shared.domain.errors import DomainError
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork
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
    scope: identity.Access,
    outlet_id: Annotated[Ulid, Query()],
    business_date: Annotated[date, Query()],
    brand: identity.BrandHeader = None,
) -> ApiResponse[list[OrderOut]]:
    """Orders of one outlet and business day (back-office; devices only push)."""
    async with open_uow(request, principal.tenant_id) as uow:
        outlet = await organization.get_outlet(uow, outlet_id)
        identity.ensure_outlet(
            scope, outlet_id=outlet.id, brand_id=outlet.brand_id, active_brand=brand
        )
        rows = await list_orders(uow, outlet_id, business_date)
    return ok([OrderOut.model_validate(o, from_attributes=True) for o in rows])


# ── Order detail and corrections (ADR-023) ──────────────────────────────────────────────────


class ModifierOut(BaseModel):
    modifier_option_id: str
    name: str
    price: int


class OrderLineOut(BaseModel):
    id: str
    product_id: str
    product_name: str
    category_name: str
    unit_price: int
    quantity: int
    line_total: int
    discount_amount: int
    promotion_id: str | None
    notes: str
    modifiers: list[ModifierOut]
    refunded_quantity: int


class OrderPaymentOut(BaseModel):
    id: str
    payment_method_id: str
    method_type: str
    amount: int
    reference: str | None


class VoidOut(BaseModel):
    reason: str
    voided_by: str
    approved_by: str | None
    voided_at: datetime


class RefundRef(BaseModel):
    id: str
    refund_no: str
    business_date: date
    total: int
    flags: list[str]


class OrderDetailOut(BaseModel):
    id: str
    outlet_id: str
    device_id: str
    shift_id: str
    receipt_no: str
    cashier_id: str
    business_date: date
    order_type: str
    table_label: str | None
    status: str
    subtotal: int
    discount_amount: int
    price_includes_tax: bool  # ADR-030: service and tax are inside the prices
    channel_id: str | None  # ADR-029
    external_ref: str | None  # the delivery app's order number
    queue_no: str | None  # P1-1: called out at the counter, e.g. A-012
    customer_name: str | None
    service_charge: int
    tax: int
    total: int
    paid_amount: int
    change_amount: int
    flags: list[str]
    created_at: datetime
    lines: list[OrderLineOut]
    payments: list[OrderPaymentOut]
    void: VoidOut | None
    refunds: list[RefundRef]


class RefundOut(BaseModel):
    id: str
    order_id: str
    outlet_id: str
    device_id: str
    shift_id: str
    refund_no: str
    business_date: date
    reason: str
    refunded_by: str
    approved_by: str | None
    total: int
    flags: list[str]
    created_at: datetime


class RefundLineOut(BaseModel):
    order_line_id: str
    product_id: str
    product_name: str
    quantity: int
    amount: int


class RefundPaymentOut(BaseModel):
    id: str
    payment_method_id: str
    method_type: str
    method_name: str
    amount: int
    reference: str | None


class RefundDetailOut(RefundOut):
    lines: list[RefundLineOut]
    payments: list[RefundPaymentOut]


_NOT_FOUND = DomainError("ORDER_NOT_FOUND", "Order not found", kind="not_found")


@router.get("/orders/lookup")
async def lookup_order(
    request: Request,
    principal: Annotated[Principal, Depends(require_ability("device:read"))],
    receipt_no: Annotated[str, Query(min_length=1, max_length=40)],
) -> ApiResponse[OrderDetailOut]:
    """A device finds an order of its own outlet (any device) to refund it while online."""
    async with open_uow(request, principal.tenant_id) as uow:
        device = await organization.get_device(uow, principal.owner_id)
        order_id = await order_id_by_receipt(uow, device.outlet.id, receipt_no)
        detail = await order_detail(uow, order_id) if order_id else None
    if detail is None:
        raise _NOT_FOUND
    return ok(OrderDetailOut.model_validate(detail))


async def _in_scope(
    uow: SqlAlchemyUnitOfWork, scope: identity.AccessScope, outlet_id: str, brand: str | None
) -> None:
    outlet = await organization.get_outlet(uow, outlet_id)
    identity.ensure_outlet(scope, outlet_id=outlet.id, brand_id=outlet.brand_id, active_brand=brand)


@router.get("/orders/{order_id}")
async def get_order(
    order_id: str,
    request: Request,
    principal: Annotated[Principal, Depends(require_ability("backoffice:read"))],
    scope: identity.Access,
    brand: identity.BrandHeader = None,
) -> ApiResponse[OrderDetailOut]:
    async with open_uow(request, principal.tenant_id) as uow:
        detail = await order_detail(uow, order_id)
        if detail is None:
            raise _NOT_FOUND
        await _in_scope(uow, scope, str(detail["outlet_id"]), brand)
    return ok(OrderDetailOut.model_validate(detail))


@router.get("/refunds")
async def refunds(
    request: Request,
    principal: Annotated[Principal, Depends(require_ability("backoffice:read"))],
    scope: identity.Access,
    outlet_id: Annotated[Ulid, Query()],
    business_date: Annotated[date, Query()],
    brand: identity.BrandHeader = None,
) -> ApiResponse[list[RefundOut]]:
    """Refunds paid out at an outlet on a business day (they count on that day, ADR-023)."""
    async with open_uow(request, principal.tenant_id) as uow:
        await _in_scope(uow, scope, outlet_id, brand)
        rows = await list_refunds(uow, outlet_id, business_date)
    return ok([RefundOut.model_validate(r) for r in rows])


@router.get("/refunds/{refund_id}")
async def get_refund(
    refund_id: str,
    request: Request,
    principal: Annotated[Principal, Depends(require_ability("backoffice:read"))],
    scope: identity.Access,
    brand: identity.BrandHeader = None,
) -> ApiResponse[RefundDetailOut]:
    async with open_uow(request, principal.tenant_id) as uow:
        detail = await refund_detail(uow, refund_id)
        if detail is None:
            raise DomainError("REFUND_NOT_FOUND", "Refund not found", kind="not_found")
        await _in_scope(uow, scope, str(detail["outlet_id"]), brand)
    return ok(RefundDetailOut.model_validate(detail))
