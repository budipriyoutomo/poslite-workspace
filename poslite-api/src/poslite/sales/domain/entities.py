from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Literal

from poslite.sales.domain.cash_rounding import CashRounding, cash_rounding
from poslite.sales.domain.events import OrderPlaced
from poslite.sales.domain.services import PriceCalculator
from poslite.sales.domain.value_objects import Discount, PriceBreakdown, PricedLine, Rates
from poslite.shared.domain.errors import DomainError
from poslite.shared.domain.events import DomainEvent


@dataclass(frozen=True, slots=True)
class LineModifier:
    modifier_option_id: str
    name: str
    price: int


@dataclass(frozen=True, slots=True)
class OrderLine:
    id: str
    product_id: str
    product_name: str
    category_name: str
    unit_price: int
    quantity: int
    notes: str
    modifiers: tuple[LineModifier, ...]
    discount: Discount | None = None
    promotion: tuple[str, str] | None = None  # (id, name) snapshot of the promotion (ADR-016)


@dataclass(frozen=True, slots=True)
class Payment:
    id: str
    payment_method_id: str
    method_type: str
    amount: int
    reference: str | None


@dataclass(frozen=True, slots=True)
class PlaceOrderData:
    order_id: str
    shift_id: str
    receipt_no: str
    cashier_id: str
    order_type: Literal["take_away", "dine_in"]
    lines: tuple[OrderLine, ...]
    discount: Discount | None
    rates: Rates
    totals: PriceBreakdown
    payments: tuple[Payment, ...]
    change_amount: int
    occurred_at: datetime
    table_label: str | None = None
    discount_approved_by: str | None = None  # manager who approved a discount over the limit
    channel_id: str | None = None  # ADR-029; absent on devices from before channels
    external_ref: str | None = None  # the delivery app's order number
    closes_bill_id: str | None = None  # ADR-031: the shared open bill this payment closes
    queue_no: str | None = None  # P1-1: take-away/delivery number, unique per device and day
    customer_name: str | None = None
    # P1-3: the outlet's rule the device rounded the cash part with, and the result (may be < 0).
    cash_rounding: CashRounding | None = None
    rounding_amount: int = 0


def _expected_rounding(data: PlaceOrderData) -> int:
    """The rounding the device's own rule gives (P1-3); nothing without a rule or cash."""
    if data.cash_rounding is None or not any(p.method_type == "cash" for p in data.payments):
        return 0
    non_cash = sum(p.amount for p in data.payments if p.method_type != "cash")
    return cash_rounding(data.totals.total, non_cash, data.cash_rounding).rounding


@dataclass
class Order:
    """A paid sale made on a device. Immutable once placed; corrections are voids (ADR-003)."""

    id: str
    outlet_id: str
    device_id: str
    data: PlaceOrderData
    business_date: date
    status: str = "paid"
    flags: tuple[str, ...] = ()
    channel_id: str | None = None  # the channel it is reported on (ADR-029)
    events: list[DomainEvent] = field(default_factory=list)

    @property
    def totals(self) -> PriceBreakdown:
        return self.data.totals

    @property
    def paid_amount(self) -> int:
        return sum(p.amount for p in self.data.payments)

    @classmethod
    def place(
        cls,
        data: PlaceOrderData,
        *,
        outlet_id: str,
        device_id: str,
        business_date: date,
        current_rates: Rates,
        qris_unpaid: bool = False,
        method_inactive: bool = False,
        discount_unapproved: bool = False,
        channel_id: str | None = None,
        channel_unknown: bool = False,
        external_ref_missing: bool = False,
    ) -> "Order":
        """Accept a sale from a device (06-domain-and-database.md, Order rules).

        Totals are recomputed with the order's own rates snapshot (ADR-011): a difference is
        flagged, never rejected — the customer already paid what the device showed.
        """
        if not data.lines:
            raise DomainError("ORDER_WITHOUT_LINES", "An order needs at least one line")
        if not data.payments:
            raise DomainError("ORDER_WITHOUT_PAYMENT", "An order needs at least one payment")
        total = data.totals.total
        non_cash = sum(p.amount for p in data.payments if p.method_type != "cash")
        if non_cash > total:
            raise DomainError("NON_CASH_EXCEEDS_TOTAL", "Non-cash payments exceed the bill")
        # The cash part is due rounded (P1-3): it may cover less than the total when rounding down.
        if sum(p.amount for p in data.payments) < total + data.rounding_amount:
            raise DomainError("PAYMENT_INSUFFICIENT", "Payments do not cover the total")

        expected = PriceCalculator().calculate(
            [
                PricedLine(
                    line.unit_price,
                    sum(m.price for m in line.modifiers),
                    line.quantity,
                    line.discount,
                )
                for line in data.lines
            ],
            data.discount,
            data.rates,
        )
        flags = []
        if expected != data.totals:
            flags.append("TOTAL_MISMATCH")
        if data.rounding_amount != _expected_rounding(data):
            flags.append("ROUNDING_MISMATCH")
        if data.rates != current_rates:
            flags.append("RATES_OUTDATED")
        if qris_unpaid:  # dynamic QRIS the gateway has not confirmed (ADR-019)
            flags.append("QRIS_UNPAID")
        if method_inactive:  # a method the outlet switched off (doc 11 §3)
            flags.append("PAYMENT_METHOD_INACTIVE")
        if discount_unapproved:  # over the brand's cashier limit without a manager (rule 5)
            flags.append("DISCOUNT_UNAPPROVED")
        if channel_unknown:  # a channel the brand no longer has (ADR-029)
            flags.append("CHANNEL_UNKNOWN")
        if external_ref_missing:  # a delivery app sale without its order number
            flags.append("EXTERNAL_REF_MISSING")

        order = cls(
            id=data.order_id,
            outlet_id=outlet_id,
            device_id=device_id,
            data=data,
            business_date=business_date,
            flags=tuple(flags),
            channel_id=channel_id,
        )
        order.events.append(
            OrderPlaced(
                order_id=order.id,
                outlet_id=outlet_id,
                business_date=business_date.isoformat(),
                total=total,
            )
        )
        return order
