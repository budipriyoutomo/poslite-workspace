"""Push payloads (07-api-contract.md) → commands. Mirrors the device's Zod schemas; both sides are
tested with tests/fixtures/sync-events.json. A payload that breaks the contract rejects only its own
event (SCHEMA_INVALID), never the whole batch."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictInt,
    StringConstraints,
    ValidationError,
    model_validator,
)

from poslite.catalog.api import ChangeAvailability
from poslite.sales.api import (
    CashRounding,
    Discount,
    LineModifier,
    OrderLine,
    Payment,
    PlaceOrderData,
    PriceBreakdown,
    Rates,
    RefundLineData,
    RefundOrderData,
    RefundPaymentData,
    VoidBillItemsData,
    VoidedBillLine,
    VoidOrderData,
)
from poslite.shared.domain.errors import DomainError
from poslite.shift.api import CloseShift, MoveCash, OpenShift

Ulid = Annotated[str, StringConstraints(pattern=r"^[0-9A-HJKMNP-TV-Z]{26}$")]
Rupiah = Annotated[StrictInt, Field(ge=0)]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class IncomingEvent(BaseModel):
    id: Ulid
    type: str
    aggregate_id: Ulid
    occurred_at: datetime
    payload: dict[str, object]


class ShiftOpenedPayload(_Strict):
    opening_cash: Rupiah
    opened_by: Ulid


class ShiftClosedPayload(_Strict):
    closed_by: Ulid
    counted_cash: Rupiah
    expected_cash: StrictInt
    variance: StrictInt


class CashMovedPayload(_Strict):
    shift_id: Ulid
    type: Literal["in", "out"]
    amount: Annotated[StrictInt, Field(gt=0)]
    reason: Annotated[str, StringConstraints(min_length=1, max_length=200)]
    created_by: Ulid


class _Modifier(_Strict):
    modifier_option_id: Ulid
    name: Annotated[str, StringConstraints(min_length=1)]
    price: Rupiah


class _Discount(_Strict):
    type: Literal["percentage", "fixed"]
    value: Rupiah


class _Promotion(_Strict):
    id: Ulid
    name: Annotated[str, StringConstraints(min_length=1, max_length=100)]


class _Line(_Strict):
    id: Ulid
    product_id: Ulid
    product_name: Annotated[str, StringConstraints(min_length=1)]
    category_name: str
    unit_price: Rupiah
    quantity: Annotated[StrictInt, Field(gt=0)]
    notes: str
    modifiers: list[_Modifier]
    # Optional so devices from before Fase 4 stay valid (07 "Push").
    discount: _Discount | None = None
    promotion: _Promotion | None = None


class _Rates(_Strict):
    service_bps: Rupiah
    tax_bps: Rupiah
    # ADR-030; optional so devices from before it stay valid (prices before tax).
    includes_tax: StrictBool = False


class _Totals(_Strict):
    subtotal: Rupiah
    discount_amount: Rupiah
    service_charge: Rupiah
    tax: Rupiah
    total: Rupiah


class _Payment(_Strict):
    id: Ulid
    payment_method_id: Ulid
    method_type: Literal["cash", "debit", "qris", "credit_card", "voucher", "other"]
    amount: Rupiah
    reference: Annotated[str, StringConstraints(max_length=64)] | None


class _CashRounding(_Strict):
    unit: Literal[100, 500, 1000]
    mode: Literal["nearest", "down"]
    amount: StrictInt


class OrderPlacedPayload(_Strict):
    shift_id: Ulid
    receipt_no: Annotated[str, StringConstraints(min_length=1, max_length=40)]
    cashier_id: Ulid
    order_type: Literal["take_away", "dine_in"]
    table_label: Annotated[str, StringConstraints(min_length=1, max_length=30)] | None = None
    lines: Annotated[list[_Line], Field(min_length=1)]
    discount: _Discount | None
    rates: _Rates
    totals: _Totals
    payments: Annotated[list[_Payment], Field(min_length=1)]
    change_amount: Rupiah
    # Manager who approved a discount over the brand's cashier limit; optional for older devices.
    discount_approved_by: Ulid | None = None
    # ADR-029; optional for devices from before sales channels.
    channel_id: Ulid | None = None
    external_ref: Annotated[str, StringConstraints(min_length=1, max_length=50)] | None = None
    # ADR-031: a full payment of a shared open bill closes it on the server.
    closes_bill_id: Ulid | None = None
    # P1-3: the outlet's cash rounding the device sold with, and what it added (may be < 0).
    cash_rounding: _CashRounding | None = None
    # P1-1: the take-away/delivery queue number and the guest's name.
    queue_no: Annotated[str, StringConstraints(min_length=1, max_length=20)] | None = None
    customer_name: Annotated[str, StringConstraints(min_length=1, max_length=40)] | None = None


Reason = Annotated[str, StringConstraints(min_length=1, max_length=200)]
MethodType = Literal["cash", "debit", "qris", "credit_card", "voucher", "other"]


class OrderVoidedPayload(_Strict):
    reason: Reason
    voided_by: Ulid
    approved_by: Ulid | None


class _RefundLine(_Strict):
    order_line_id: Ulid
    quantity: Annotated[StrictInt, Field(gt=0)]
    amount: Rupiah


class _RefundPayment(_Strict):
    id: Ulid
    payment_method_id: Ulid
    method_type: MethodType
    method_name: Annotated[str, StringConstraints(min_length=1, max_length=100)]
    amount: Rupiah
    reference: Annotated[str, StringConstraints(max_length=64)] | None


class OrderRefundedPayload(_Strict):
    order_id: Ulid
    shift_id: Ulid
    refund_no: Annotated[str, StringConstraints(min_length=1, max_length=40)]
    reason: Reason
    refunded_by: Ulid
    approved_by: Ulid | None
    lines: Annotated[list[_RefundLine], Field(min_length=1)]
    total: Rupiah
    payments: Annotated[list[_RefundPayment], Field(min_length=1)]


class _VoidedBillLine(_Strict):
    product_id: Ulid
    product_name: Annotated[str, StringConstraints(min_length=1, max_length=150)]
    modifiers: list[Annotated[str, StringConstraints(min_length=1, max_length=100)]]
    unit_price: Rupiah
    quantity: Annotated[StrictInt, Field(gt=0)]
    amount: Rupiah

    @model_validator(mode="after")
    def _amount_is_price_times_quantity(self) -> "_VoidedBillLine":
        if self.amount != self.unit_price * self.quantity:
            raise ValueError("amount must be unit_price x quantity")
        return self


class BillItemVoidedPayload(_Strict):
    bill_id: Ulid
    scope: Literal["line", "bill_cancelled"]
    table_label: Annotated[str, StringConstraints(min_length=1, max_length=30)]
    shift_id: Ulid
    cashier_id: Ulid
    approved_by: Ulid | None
    reason: Reason
    lines: Annotated[list[_VoidedBillLine], Field(min_length=1)]


class ProductAvailabilityChangedPayload(_Strict):
    product_id: Ulid
    is_available: StrictBool
    until: AwareDatetime | None  # P1-2: a sold-out mark ends by itself then
    changed_by: Ulid


Command = (
    ChangeAvailability
    | OpenShift
    | CloseShift
    | MoveCash
    | PlaceOrderData
    | VoidOrderData
    | RefundOrderData
    | VoidBillItemsData
)


def _parse[P: _Strict](model: type[P], event: IncomingEvent) -> P:
    try:
        return model.model_validate(event.payload)
    except ValidationError as err:
        raise DomainError(
            "SCHEMA_INVALID", f"{event.type}: {err.error_count()} invalid field(s)"
        ) from err


def _discount(d: _Discount | None) -> Discount | None:
    return Discount(d.type, d.value) if d else None


def to_command(event: IncomingEvent) -> Command:
    match event.type:
        case "shift.opened":
            opened = _parse(ShiftOpenedPayload, event)
            return OpenShift(
                event.aggregate_id, opened.opened_by, opened.opening_cash, event.occurred_at
            )
        case "shift.closed":
            closed = _parse(ShiftClosedPayload, event)
            return CloseShift(
                event.aggregate_id,
                closed.closed_by,
                closed.counted_cash,
                closed.expected_cash,
                closed.variance,
                event.occurred_at,
            )
        case "cash.moved":
            moved = _parse(CashMovedPayload, event)
            return MoveCash(
                event.aggregate_id,
                moved.shift_id,
                moved.type,
                moved.amount,
                moved.reason,
                moved.created_by,
                event.occurred_at,
            )
        case "order.placed":
            p = _parse(OrderPlacedPayload, event)
            try:
                return PlaceOrderData(
                    order_id=event.aggregate_id,
                    shift_id=p.shift_id,
                    receipt_no=p.receipt_no,
                    cashier_id=p.cashier_id,
                    order_type=p.order_type,
                    lines=tuple(
                        OrderLine(
                            id=line.id,
                            product_id=line.product_id,
                            product_name=line.product_name,
                            category_name=line.category_name,
                            unit_price=line.unit_price,
                            quantity=line.quantity,
                            notes=line.notes,
                            modifiers=tuple(
                                LineModifier(m.modifier_option_id, m.name, m.price)
                                for m in line.modifiers
                            ),
                            discount=_discount(line.discount),
                            promotion=(
                                (line.promotion.id, line.promotion.name) if line.promotion else None
                            ),
                        )
                        for line in p.lines
                    ),
                    discount=_discount(p.discount),
                    rates=Rates(p.rates.service_bps, p.rates.tax_bps, p.rates.includes_tax),
                    totals=PriceBreakdown(
                        p.totals.subtotal,
                        p.totals.discount_amount,
                        p.totals.service_charge,
                        p.totals.tax,
                        p.totals.total,
                    ),
                    payments=tuple(
                        Payment(y.id, y.payment_method_id, y.method_type, y.amount, y.reference)
                        for y in p.payments
                    ),
                    change_amount=p.change_amount,
                    occurred_at=event.occurred_at,
                    table_label=p.table_label,
                    discount_approved_by=p.discount_approved_by,
                    channel_id=p.channel_id,
                    external_ref=p.external_ref,
                    closes_bill_id=p.closes_bill_id,
                    cash_rounding=(
                        CashRounding(p.cash_rounding.unit, p.cash_rounding.mode)
                        if p.cash_rounding
                        else None
                    ),
                    rounding_amount=p.cash_rounding.amount if p.cash_rounding else 0,
                    queue_no=p.queue_no,
                    customer_name=p.customer_name,
                )
            except ValueError as err:  # value objects guard ranges (e.g. percentage > 100)
                raise DomainError("SCHEMA_INVALID", str(err)) from err
        case "order.voided":
            v = _parse(OrderVoidedPayload, event)
            return VoidOrderData(
                event.aggregate_id, v.reason, v.voided_by, v.approved_by, event.occurred_at
            )
        case "order.refunded":
            r = _parse(OrderRefundedPayload, event)
            return RefundOrderData(
                refund_id=event.aggregate_id,
                order_id=r.order_id,
                shift_id=r.shift_id,
                refund_no=r.refund_no,
                reason=r.reason,
                refunded_by=r.refunded_by,
                approved_by=r.approved_by,
                lines=tuple(RefundLineData(x.order_line_id, x.quantity, x.amount) for x in r.lines),
                total=r.total,
                payments=tuple(
                    RefundPaymentData(
                        y.id,
                        y.payment_method_id,
                        y.method_type,
                        y.method_name,
                        y.amount,
                        y.reference,
                    )
                    for y in r.payments
                ),
                occurred_at=event.occurred_at,
            )
        case "product.availability_changed":
            a = _parse(ProductAvailabilityChangedPayload, event)
            return ChangeAvailability(
                a.product_id, a.is_available, a.until, a.changed_by, event.occurred_at
            )
        case "bill.item_voided":
            b = _parse(BillItemVoidedPayload, event)
            return VoidBillItemsData(
                void_id=event.aggregate_id,
                bill_id=b.bill_id,
                scope=b.scope,
                table_label=b.table_label,
                shift_id=b.shift_id,
                cashier_id=b.cashier_id,
                approved_by=b.approved_by,
                reason=b.reason,
                lines=tuple(
                    VoidedBillLine(
                        x.product_id,
                        x.product_name,
                        tuple(x.modifiers),
                        x.unit_price,
                        x.quantity,
                        x.amount,
                    )
                    for x in b.lines
                ),
                occurred_at=event.occurred_at,
            )
        case _:
            raise DomainError(
                "UNSUPPORTED_EVENT_TYPE", f"Event type {event.type} is not handled yet"
            )
