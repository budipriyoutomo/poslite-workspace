from dataclasses import dataclass, field
from datetime import date, datetime

from poslite.shared.domain.errors import DomainError
from poslite.shared.domain.events import DomainEvent
from poslite.shift.domain.events import ShiftClosed, ShiftOpened


@dataclass
class Shift:
    """A cashier session on one device: opened with a cash float, closed with a cash count."""

    id: str
    outlet_id: str
    device_id: str
    opened_by: str
    opened_at: datetime
    opening_cash: int
    business_date: date
    status: str = "open"
    closed_by: str | None = None
    closed_at: datetime | None = None
    counted_cash: int | None = None
    expected_cash: int | None = None
    variance: int | None = None
    events: list[DomainEvent] = field(default_factory=list)

    @classmethod
    def open(
        cls,
        *,
        shift_id: str,
        outlet_id: str,
        device_id: str,
        opened_by: str,
        opened_at: datetime,
        opening_cash: int,
        business_date: date,
    ) -> "Shift":
        if opening_cash < 0:
            raise DomainError("INVALID_AMOUNT", "Opening cash must be >= 0")
        shift = cls(
            shift_id, outlet_id, device_id, opened_by, opened_at, opening_cash, business_date
        )
        shift.events.append(ShiftOpened(shift_id, outlet_id, business_date.isoformat()))
        return shift

    def close(
        self,
        *,
        closed_by: str,
        closed_at: datetime,
        counted_cash: int,
        expected_cash: int,
        variance: int,
    ) -> None:
        """Expected cash comes from the device; the variance is recorded, never blocking."""
        if self.status == "closed":
            raise DomainError("SHIFT_ALREADY_CLOSED", "Shift is already closed")
        if variance != counted_cash - expected_cash:
            raise DomainError(
                "VARIANCE_MISMATCH", "variance must equal counted_cash - expected_cash"
            )
        self.status, self.closed_by, self.closed_at = "closed", closed_by, closed_at
        self.counted_cash, self.expected_cash, self.variance = counted_cash, expected_cash, variance
        self.events.append(
            ShiftClosed(self.id, self.outlet_id, self.business_date.isoformat(), variance)
        )


@dataclass(frozen=True, slots=True)
class CashMovement:
    """Cash in/out of the drawer outside sales (e.g. buying ice, a deposit to the owner)."""

    id: str
    shift_id: str
    type: str
    amount: int
    reason: str
    created_by: str
    created_at: datetime

    @classmethod
    def record(
        cls,
        *,
        movement_id: str,
        shift: Shift,
        type: str,
        amount: int,
        reason: str,
        created_by: str,
        created_at: datetime,
    ) -> "CashMovement":
        if shift.status != "open":
            raise DomainError("SHIFT_CLOSED", "Cash can only move on an open shift")
        if amount <= 0:
            raise DomainError("INVALID_AMOUNT", "Amount must be > 0")
        return cls(movement_id, shift.id, type, amount, reason, created_by, created_at)
