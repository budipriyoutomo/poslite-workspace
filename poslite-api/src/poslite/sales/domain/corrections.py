"""Corrections of paid orders (ADR-023). A paid order never changes (ADR-003): a void is its own
record that cancels the whole order within its shift, a refund is a new document."""

from dataclasses import dataclass, field
from datetime import date, datetime

from poslite.sales.domain.events import OrderRefunded, OrderVoided
from poslite.sales.domain.services import RefundAllocator
from poslite.shared.domain.errors import DomainError
from poslite.shared.domain.events import DomainEvent


@dataclass(frozen=True, slots=True)
class SoldLine:
    """An order line as a refund sees it: what it cost and how much of it went back already."""

    id: str
    product_id: str
    product_name: str
    quantity: int
    gross: int
    line_discount: int
    refunded: int


@dataclass(frozen=True, slots=True)
class OrderForCorrection:
    id: str
    outlet_id: str
    device_id: str
    shift_id: str
    status: str
    business_date: date
    total: int
    discount_amount: int  # line discounts + order discount, as stored on the order
    lines: tuple[SoldLine, ...]  # in sort order
    has_refund: bool


@dataclass(frozen=True, slots=True)
class VoidOrderData:
    order_id: str
    reason: str
    voided_by: str
    approved_by: str | None
    occurred_at: datetime


@dataclass(frozen=True, slots=True)
class RefundLineData:
    order_line_id: str
    quantity: int
    amount: int


@dataclass(frozen=True, slots=True)
class RefundPaymentData:
    id: str
    payment_method_id: str
    method_type: str
    method_name: str
    amount: int
    reference: str | None


@dataclass(frozen=True, slots=True)
class RefundOrderData:
    refund_id: str
    order_id: str
    shift_id: str
    refund_no: str
    reason: str
    refunded_by: str
    approved_by: str | None
    lines: tuple[RefundLineData, ...]
    total: int
    payments: tuple[RefundPaymentData, ...]
    occurred_at: datetime


@dataclass
class OrderVoid:
    order_id: str
    device_id: str
    reason: str
    voided_by: str
    approved_by: str | None
    voided_at: datetime
    events: list[DomainEvent] = field(default_factory=list)

    @classmethod
    def of(
        cls, order: OrderForCorrection, cmd: VoidOrderData, *, device_id: str, shift_open: bool
    ) -> "OrderVoid":
        """Only while the order's shift is open on the device that sold it, and never after a
        refund: once the drawer is counted, a correction is a refund on today's shift."""
        if order.status == "voided":
            raise DomainError("ORDER_ALREADY_VOIDED", "Order is already voided", kind="conflict")
        if order.device_id != device_id or not shift_open or order.has_refund:
            raise DomainError(
                "VOID_NOT_ALLOWED",
                "Only an order of this device, in its open shift, without refunds can be voided",
                kind="conflict",
            )
        void = cls(order.id, device_id, cmd.reason, cmd.voided_by, cmd.approved_by, cmd.occurred_at)
        void.events.append(OrderVoided(order.id, order.outlet_id, order.business_date.isoformat()))
        return void


@dataclass(frozen=True, slots=True)
class RefundedLine:
    order_line_id: str
    product_id: str
    product_name: str
    quantity: int
    amount: int


@dataclass
class Refund:
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
    lines: tuple[RefundedLine, ...]
    payments: tuple[RefundPaymentData, ...]
    created_at: datetime
    flags: tuple[str, ...] = ()
    events: list[DomainEvent] = field(default_factory=list)

    @classmethod
    def record(
        cls,
        order: OrderForCorrection,
        cmd: RefundOrderData,
        *,
        device_id: str,
        business_date: date,
    ) -> "Refund":
        """Money already left the drawer when this arrives (offline), so disagreements are
        flagged, not rejected — like totals on order.placed (ADR-011, ADR-016)."""
        sold = {line.id: line for line in order.lines}
        if not cmd.lines or any(r.order_line_id not in sold for r in cmd.lines):
            raise DomainError("REFUND_INVALID_LINE", "A refund line is not a line of this order")
        if len({r.order_line_id for r in cmd.lines}) != len(cmd.lines):
            raise DomainError("REFUND_INVALID_LINE", "An order line appears twice in a refund")
        if sum(p.amount for p in cmd.payments) != cmd.total:
            raise DomainError("REFUND_PAYMENT_MISMATCH", "Refund payments must add up to its total")

        line_discounts = sum(line.line_discount for line in order.lines)
        allocation = dict(
            zip(
                sold,
                RefundAllocator.allocate(
                    nets=[line.gross - line.line_discount for line in order.lines],
                    order_discount=order.discount_amount - line_discounts,
                    total=order.total,
                ),
                strict=True,
            )
        )
        flags: list[str] = []
        mismatch = sum(r.amount for r in cmd.lines) != cmd.total
        for r in cmd.lines:
            line = sold[r.order_line_id]
            if r.quantity > line.quantity - line.refunded:
                flags.append("REFUND_EXCEEDS_ORDER")  # e.g. two devices refunded it offline
                continue
            expected = RefundAllocator.amount(
                allocated=allocation[line.id],
                quantity=line.quantity,
                already_refunded=line.refunded,
                refund_quantity=r.quantity,
            )
            mismatch = mismatch or expected != r.amount
        if mismatch:
            flags.append("TOTAL_MISMATCH")
        if order.status == "voided":
            flags.append("REFUND_ON_VOIDED")

        refund = cls(
            id=cmd.refund_id,
            order_id=order.id,
            outlet_id=order.outlet_id,
            device_id=device_id,
            shift_id=cmd.shift_id,
            refund_no=cmd.refund_no,
            business_date=business_date,
            reason=cmd.reason,
            refunded_by=cmd.refunded_by,
            approved_by=cmd.approved_by,
            total=cmd.total,
            lines=tuple(
                RefundedLine(
                    r.order_line_id,
                    sold[r.order_line_id].product_id,
                    sold[r.order_line_id].product_name,
                    r.quantity,
                    r.amount,
                )
                for r in cmd.lines
            ),
            payments=cmd.payments,
            created_at=cmd.occurred_at,
            flags=tuple(dict.fromkeys(flags)),
        )
        refund.events.append(
            OrderRefunded(refund.id, order.id, order.outlet_id, business_date.isoformat())
        )
        return refund
