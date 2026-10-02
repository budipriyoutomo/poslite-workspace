"""Push payloads (07-api-contract.md) → commands. Mirrors the device's Zod schemas; both sides are
tested with tests/fixtures/sync-events.json. A payload that breaks the contract rejects only its own
event (SCHEMA_INVALID), never the whole batch."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StringConstraints, ValidationError

from poslite.sales.api import (
    Discount,
    LineModifier,
    OrderLine,
    Payment,
    PlaceOrderData,
    PriceBreakdown,
    Rates,
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


Command = OpenShift | CloseShift | MoveCash | PlaceOrderData


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
                    rates=Rates(p.rates.service_bps, p.rates.tax_bps),
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
                )
            except ValueError as err:  # value objects guard ranges (e.g. percentage > 100)
                raise DomainError("SCHEMA_INVALID", str(err)) from err
        case _:
            raise DomainError(
                "UNSUPPORTED_EVENT_TYPE", f"Event type {event.type} is not handled yet"
            )
