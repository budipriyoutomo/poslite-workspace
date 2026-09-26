"""In-memory fakes for use-case tests (no DB): repositories, ports and a unit of work."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import time

from poslite.sales.domain.entities import Order
from poslite.shared.application.ports import OutletProfile
from poslite.shared.domain.events import DomainEvent
from poslite.shift.domain.entities import CashMovement, Shift


class InMemoryOrders:
    def __init__(self) -> None:
        self.rows: dict[str, Order] = {}

    async def exists(self, order_id: str) -> bool:
        return order_id in self.rows

    async def add(self, order: Order) -> None:
        self.rows[order.id] = order


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
            dict(self.shifts.rows),
            list(self.shifts.movements),
            list(self.events),
        )
        try:
            yield
        except BaseException:
            self.orders.rows, self.shifts.rows, self.shifts.movements, self.events = (
                snapshot[0],
                snapshot[1],
                snapshot[2],
                snapshot[3],
            )
            raise

    async def status_of(self, event_id: str) -> str | None:
        found = self.sync_events.get(event_id)
        return found[0] if found else None
