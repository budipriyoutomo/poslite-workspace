from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from typing import Literal, Protocol

from poslite.sales.api import (
    OrderRepository,
    PlaceOrderData,
    PlaceOrderHandler,
    RefundOrderData,
    RefundOrderHandler,
    VoidOrderData,
    VoidOrderHandler,
)
from poslite.shared.application.sync import DeviceContext, EventOutcome
from poslite.shared.domain.errors import DomainError
from poslite.shared.domain.events import DomainEvent
from poslite.shift.api import (
    CloseShift,
    CloseShiftHandler,
    MoveCash,
    MoveCashHandler,
    OpenShift,
    OpenShiftHandler,
    ShiftRepository,
)
from poslite.sync.application.events import IncomingEvent, to_command


@dataclass(frozen=True, slots=True)
class EventResult:
    id: str
    status: Literal["accepted", "flagged", "rejected", "duplicate"]
    flags: tuple[str, ...] = ()
    code: str | None = None
    message: str | None = None


class SyncEventRepository(Protocol):
    """Idempotency ledger: one row per pushed event id (PK), with its last status."""

    async def status_of(self, event_id: str) -> str | None: ...
    async def save(self, event: IncomingEvent, device_id: str, result: "EventResult") -> None: ...


class PushUnitOfWork(Protocol):
    """What a push needs from a unit of work: repositories, events, savepoints, a lock."""

    orders: OrderRepository
    shifts: ShiftRepository

    def record(self, event: DomainEvent) -> None: ...
    def savepoint(self) -> AbstractAsyncContextManager[None]: ...
    async def lock_device(self, device_id: str) -> None: ...


class EventRegistry:
    """Event type → use case of the owning module (05: sync calls use cases, never their tables)."""

    def __init__(
        self,
        *,
        place_order: PlaceOrderHandler,
        open_shift: OpenShiftHandler,
        close_shift: CloseShiftHandler,
        move_cash: MoveCashHandler,
        void_order: VoidOrderHandler,
        refund_order: RefundOrderHandler,
    ) -> None:
        self._place_order, self._open_shift = place_order, open_shift
        self._close_shift, self._move_cash = close_shift, move_cash
        self._void_order, self._refund_order = void_order, refund_order

    async def dispatch(
        self, event: IncomingEvent, ctx: DeviceContext, uow: PushUnitOfWork
    ) -> EventOutcome:
        match to_command(event):
            case PlaceOrderData() as cmd:
                return await self._place_order(cmd, ctx, uow)
            case OpenShift() as cmd:
                return await self._open_shift(cmd, ctx, uow)
            case CloseShift() as cmd:
                return await self._close_shift(cmd, ctx, uow)
            case MoveCash() as cmd:
                return await self._move_cash(cmd, ctx, uow)
            case VoidOrderData() as cmd:
                return await self._void_order(cmd, ctx, uow)
            case RefundOrderData() as cmd:
                return await self._refund_order(cmd, ctx, uow)


class PushEventsHandler:
    """POST /sync/push (05-backend-architecture.md "Push handler"). The caller owns the transaction.

    - one device at a time (advisory lock until commit), events applied in order
    - `accepted`/`flagged` before → `duplicate`, nothing applied twice; `rejected` → processed again
    - a savepoint per event: a rejected event rolls back only itself (and its domain events)
    - unexpected errors are not caught: the whole batch rolls back and the device retries it
    """

    def __init__(self, registry: EventRegistry) -> None:
        self._registry = registry

    async def __call__(
        self,
        ctx: DeviceContext,
        events: list[IncomingEvent],
        uow: PushUnitOfWork,
        sync_events: SyncEventRepository,
    ) -> list[EventResult]:
        await uow.lock_device(ctx.device_id)
        results: list[EventResult] = []
        for event in events:
            if await sync_events.status_of(event.id) in ("accepted", "flagged"):
                results.append(EventResult(event.id, "duplicate"))
                continue
            try:
                async with uow.savepoint():
                    outcome = await self._registry.dispatch(event, ctx, uow)
                result = EventResult(event.id, outcome.status, outcome.flags)
            except DomainError as err:
                result = EventResult(event.id, "rejected", code=err.code, message=str(err))
            await sync_events.save(
                event, ctx.device_id, result
            )  # outside the savepoint: rejects are kept
            results.append(result)
        return results
