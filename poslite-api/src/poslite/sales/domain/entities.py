from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Literal

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
        if sum(p.amount for p in data.payments) < total:
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
        if data.rates != current_rates:
            flags.append("RATES_OUTDATED")

        order = cls(
            id=data.order_id,
            outlet_id=outlet_id,
            device_id=device_id,
            data=data,
            business_date=business_date,
            flags=tuple(flags),
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
