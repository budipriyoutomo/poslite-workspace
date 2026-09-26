from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from poslite.shared.application.ports import CashierPort, EventRecorder, OutletPort
from poslite.shared.application.sync import DeviceContext, EventOutcome
from poslite.shared.domain.business_date import business_date
from poslite.shared.domain.errors import DomainError
from poslite.shift.domain.entities import CashMovement, Shift
from poslite.shift.domain.repository import ShiftRepository


class ShiftUnitOfWork(EventRecorder, Protocol):
    shifts: ShiftRepository


@dataclass(frozen=True, slots=True)
class OpenShift:
    shift_id: str
    opened_by: str
    opening_cash: int
    occurred_at: datetime


@dataclass(frozen=True, slots=True)
class CloseShift:
    shift_id: str
    closed_by: str
    counted_cash: int
    expected_cash: int
    variance: int
    occurred_at: datetime


@dataclass(frozen=True, slots=True)
class MoveCash:
    movement_id: str
    shift_id: str
    type: str
    amount: int
    reason: str
    created_by: str
    occurred_at: datetime


async def _require_cashier(cashiers: CashierPort, user_id: str, ctx: DeviceContext) -> None:
    if not await cashiers.can_work(user_id, ctx.outlet_id):
        raise DomainError(
            "CASHIER_NOT_IN_OUTLET", "Cashier does not work at this outlet", kind="forbidden"
        )


async def _device_shift(uow: ShiftUnitOfWork, shift_id: str, ctx: DeviceContext) -> Shift:
    """A device can only act on its own shifts."""
    shift = await uow.shifts.get(shift_id)
    if shift is None or shift.device_id != ctx.device_id:
        raise DomainError("SHIFT_NOT_FOUND", "Shift not found on this device", kind="not_found")
    return shift


def _flush_events(uow: ShiftUnitOfWork, shift: Shift) -> None:
    for event in shift.events:
        uow.record(event)
    shift.events.clear()


class OpenShiftHandler:
    def __init__(self, outlets: OutletPort, cashiers: CashierPort) -> None:
        self._outlets, self._cashiers = outlets, cashiers

    async def __call__(
        self, cmd: OpenShift, ctx: DeviceContext, uow: ShiftUnitOfWork
    ) -> EventOutcome:
        if await uow.shifts.get(cmd.shift_id) is not None:
            raise DomainError(
                "SHIFT_ALREADY_EXISTS", "A shift with this id already exists", kind="conflict"
            )
        await _require_cashier(self._cashiers, cmd.opened_by, ctx)
        outlet = await self._outlets.profile(ctx.outlet_id)
        shift = Shift.open(
            shift_id=cmd.shift_id,
            outlet_id=ctx.outlet_id,
            device_id=ctx.device_id,
            opened_by=cmd.opened_by,
            opened_at=cmd.occurred_at,
            opening_cash=cmd.opening_cash,
            business_date=business_date(
                cmd.occurred_at, outlet.timezone, outlet.business_day_cutoff
            ),
        )
        await uow.shifts.add(shift)
        _flush_events(uow, shift)
        return EventOutcome("accepted")


class CloseShiftHandler:
    def __init__(self, cashiers: CashierPort) -> None:
        self._cashiers = cashiers

    async def __call__(
        self, cmd: CloseShift, ctx: DeviceContext, uow: ShiftUnitOfWork
    ) -> EventOutcome:
        shift = await _device_shift(uow, cmd.shift_id, ctx)
        await _require_cashier(self._cashiers, cmd.closed_by, ctx)
        shift.close(
            closed_by=cmd.closed_by,
            closed_at=cmd.occurred_at,
            counted_cash=cmd.counted_cash,
            expected_cash=cmd.expected_cash,
            variance=cmd.variance,
        )
        await uow.shifts.save(shift)
        _flush_events(uow, shift)
        return EventOutcome("accepted")


class MoveCashHandler:
    def __init__(self, cashiers: CashierPort) -> None:
        self._cashiers = cashiers

    async def __call__(
        self, cmd: MoveCash, ctx: DeviceContext, uow: ShiftUnitOfWork
    ) -> EventOutcome:
        shift = await _device_shift(uow, cmd.shift_id, ctx)
        await _require_cashier(self._cashiers, cmd.created_by, ctx)
        movement = CashMovement.record(
            movement_id=cmd.movement_id,
            shift=shift,
            type=cmd.type,
            amount=cmd.amount,
            reason=cmd.reason,
            created_by=cmd.created_by,
            created_at=cmd.occurred_at,
        )
        await uow.shifts.add_movement(movement)
        return EventOutcome("accepted")
