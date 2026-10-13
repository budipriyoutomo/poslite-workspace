"""In-memory fakes for use-case tests (no DB): repositories, ports and a unit of work."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import time

from poslite.sales.domain.corrections import OrderForCorrection, OrderVoid, Refund, SoldLine
from poslite.sales.domain.entities import Order
from poslite.sales.domain.services import PriceCalculator
from poslite.shared.application.ports import OutletProfile
from poslite.shared.domain.events import DomainEvent
from poslite.shift.domain.entities import CashMovement, Shift


class InMemoryOrders:
    def __init__(self) -> None:
        self.rows: dict[str, Order] = {}
        self.voids: dict[str, OrderVoid] = {}
        self.refunds: dict[str, Refund] = {}

    async def exists(self, order_id: str) -> bool:
        return order_id in self.rows

    async def add(self, order: Order) -> None:
        self.rows[order.id] = order

    async def for_correction(self, order_id: str) -> OrderForCorrection | None:
        order = self.rows.get(order_id)
        if order is None:
            return None
        refunded: dict[str, int] = {}
        for refund in self.refunds.values():
            if refund.order_id == order_id:
                for line in refund.lines:
                    refunded[line.order_line_id] = (
                        refunded.get(line.order_line_id, 0) + line.quantity
                    )
        lines = []
        for line in order.data.lines:
            gross = (line.unit_price + sum(m.price for m in line.modifiers)) * line.quantity
            lines.append(
                SoldLine(
                    id=line.id,
                    product_id=line.product_id,
                    product_name=line.product_name,
                    quantity=line.quantity,
                    gross=gross,
                    line_discount=PriceCalculator.line_discount(gross, line.discount),
                    refunded=refunded.get(line.id, 0),
                )
            )
        return OrderForCorrection(
            id=order.id,
            outlet_id=order.outlet_id,
            device_id=order.device_id,
            shift_id=order.data.shift_id,
            status="voided" if order_id in self.voids else order.status,
            business_date=order.business_date,
            total=order.totals.total,
            discount_amount=order.totals.discount_amount,
            lines=tuple(lines),
            has_refund=bool(refunded),
        )

    async def add_void(self, void: OrderVoid) -> None:
        self.voids[void.order_id] = void

    async def add_refund(self, refund: Refund) -> None:
        self.refunds[refund.id] = refund


class InMemoryShifts:
    def __init__(self) -> None:
        self.rows: dict[str, Shift] = {}
        self.movements: list[CashMovement] = []

    async def get(self, shift_id: str) -> Shift | None:
        return self.rows.get(shift_id)

    async def add(self, shift: Shift) -> None:
        self.rows[shift.id] = shift

    async def save(self, shift: Shift) -> None:
        self.rows[shift.id] = shift

    async def add_movement(self, movement: CashMovement) -> None:
        self.movements.append(movement)


class FakeUnitOfWork:
    def __init__(self) -> None:
        self.orders = InMemoryOrders()
        self.shifts = InMemoryShifts()
        self.events: list[DomainEvent] = []
        self.committed = False

    def record(self, event: DomainEvent) -> None:
        self.events.append(event)

    async def commit(self) -> None:  # use cases must never call this (ADR-010)
        self.committed = True


class FakeOutlets:
    def __init__(self, profile: OutletProfile | None = None) -> None:
        self.value = profile or OutletProfile(
            service_bps=500, tax_bps=1000, timezone="Asia/Jakarta", business_day_cutoff=time(4, 0)
        )

    async def profile(self, outlet_id: str) -> OutletProfile:
        return self.value


class FakeCashiers:
    def __init__(self, allowed: set[str]) -> None:
        self.allowed = allowed

    async def can_work(self, user_id: str, outlet_id: str) -> bool:
        return user_id in self.allowed


class FakeApprovers:
    """Users holding every permission (stand-in for owners and managers)."""

    def __init__(self, allowed: set[str]) -> None:
        self.allowed = allowed

    async def can_approve(self, user_id: str, outlet_id: str, permission: str) -> bool:
        return user_id in self.allowed


class FakeShiftStatuses:
    def __init__(self, shifts: InMemoryShifts) -> None:
        self._shifts = shifts

    async def status(self, shift_id: str) -> str | None:
        shift = self._shifts.rows.get(shift_id)
        return shift.status if shift else None


class FakePushUnitOfWork(FakeUnitOfWork):
    """Adds sync_events, a device lock log and a savepoint that really rolls back its changes."""

    def __init__(self) -> None:
        super().__init__()
        self.sync_events: dict[str, tuple[str, str | None]] = {}
        self.locked: list[str] = []

    async def lock_device(self, device_id: str) -> None:
        self.locked.append(device_id)

    @asynccontextmanager
    async def savepoint(self) -> AsyncIterator[None]:
        snapshot = (
            dict(self.orders.rows),
            dict(self.orders.voids),
            dict(self.orders.refunds),
            dict(self.shifts.rows),
            list(self.shifts.movements),
            list(self.events),
        )
        try:
            yield
        except BaseException:
            (
                self.orders.rows,
                self.orders.voids,
                self.orders.refunds,
                self.shifts.rows,
                self.shifts.movements,
                self.events,
            ) = snapshot
            raise

    async def status_of(self, event_id: str) -> str | None:
        found = self.sync_events.get(event_id)
        return found[0] if found else None
