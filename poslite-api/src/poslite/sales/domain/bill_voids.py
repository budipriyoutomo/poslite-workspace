"""Items cancelled from an open bill after they went to the kitchen (ADR-028). The bill itself
lives only on the device (ADR-015); this record is all the server knows of it. It is kept for
the leakage report and never touches sales, tax or the drawer."""

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Literal

from poslite.sales.domain.events import BillItemsVoided
from poslite.shared.domain.events import DomainEvent

VoidScope = Literal["line", "bill_cancelled"]


@dataclass(frozen=True, slots=True)
class VoidedBillLine:
    product_id: str
    product_name: str
    modifiers: tuple[str, ...]
    unit_price: int  # with modifiers, before any discount
    quantity: int
    amount: int


@dataclass(frozen=True, slots=True)
class VoidBillItemsData:
    void_id: str
    bill_id: str
    scope: VoidScope
    table_label: str
    shift_id: str
    cashier_id: str
    approved_by: str | None
    reason: str
    lines: tuple[VoidedBillLine, ...]
    occurred_at: datetime


@dataclass
class BillVoid:
    id: str
    outlet_id: str
    device_id: str
    shift_id: str
    business_date: date
    bill_id: str
    scope: VoidScope
    table_label: str
    cashier_id: str
    approved_by: str | None
    reason: str
    lines: tuple[VoidedBillLine, ...]
    amount: int
    voided_at: datetime
    events: list[DomainEvent] = field(default_factory=list)

    @classmethod
    def record(
        cls, cmd: VoidBillItemsData, *, outlet_id: str, device_id: str, business_date: date
    ) -> "BillVoid":
        """Never rejected for business reasons (ADR-003): the kitchen already cooked."""
        void = cls(
            id=cmd.void_id,
            outlet_id=outlet_id,
            device_id=device_id,
            shift_id=cmd.shift_id,
            business_date=business_date,
            bill_id=cmd.bill_id,
            scope=cmd.scope,
            table_label=cmd.table_label,
            cashier_id=cmd.cashier_id,
            approved_by=cmd.approved_by,
            reason=cmd.reason,
            lines=cmd.lines,
            amount=sum(line.amount for line in cmd.lines),
            voided_at=cmd.occurred_at,
        )
        void.events.append(BillItemsVoided(void.id, outlet_id, business_date.isoformat()))
        return void
