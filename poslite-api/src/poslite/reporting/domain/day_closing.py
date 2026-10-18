"""Day closing rules (ADR-026): when a business day may be closed and what to warn about."""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime

from poslite.shared.domain.errors import DomainError


@dataclass(frozen=True, slots=True)
class DeviceSeen:
    id: str
    code: str
    name: str
    last_seen_at: datetime | None


@dataclass(frozen=True, slots=True)
class ShiftCash:
    status: str
    opening_cash: int
    expected_cash: int | None = None
    counted_cash: int | None = None
    variance: int | None = None


@dataclass(frozen=True, slots=True)
class CashSummary:
    """Cash of every shift of one outlet and day; counts and variance only from closed shifts."""

    shift_count: int
    open_shift_count: int
    opening_cash: int
    expected_cash: int
    counted_cash: int
    variance: int

    @classmethod
    def of(cls, shifts: Iterable[ShiftCash]) -> "CashSummary":
        rows = list(shifts)
        closed = [s for s in rows if s.status == "closed"]
        return cls(
            shift_count=len(rows),
            open_shift_count=len(rows) - len(closed),
            opening_cash=sum(s.opening_cash for s in rows),
            expected_cash=sum(s.expected_cash or 0 for s in closed),
            counted_cash=sum(s.counted_cash or 0 for s in closed),
            variance=sum(s.variance or 0 for s in closed),
        )

    def as_dict(self) -> dict[str, int]:
        return {
            "shift_count": self.shift_count,
            "open_shift_count": self.open_shift_count,
            "opening_cash": self.opening_cash,
            "expected_cash": self.expected_cash,
            "counted_cash": self.counted_cash,
            "variance": self.variance,
        }


def ensure_can_close(*, now: datetime, day_end: datetime, closed: bool) -> None:
    if closed:
        raise DomainError(
            "DAY_ALREADY_CLOSED", "This business day is already closed", kind="conflict"
        )
    if now < day_end:
        raise DomainError("DAY_NOT_ENDED", "The business day has not ended yet")


def day_warnings(
    *, open_shift_count: int, devices: Iterable[DeviceSeen], day_end: datetime
) -> list[dict[str, object]]:
    """Never blocking: open shifts, and devices that may still hold the day's unsynced sales."""
    warnings: list[dict[str, object]] = []
    if open_shift_count:
        warnings.append({"code": "OPEN_SHIFTS", "count": open_shift_count})
    stale = [d for d in devices if d.last_seen_at is None or d.last_seen_at < day_end]
    if stale:
        warnings.append(
            {
                "code": "DEVICES_NOT_SYNCED",
                "devices": [
                    {
                        "id": d.id,
                        "code": d.code,
                        "name": d.name,
                        "last_seen_at": d.last_seen_at.isoformat() if d.last_seen_at else None,
                    }
                    for d in stale
                ],
            }
        )
    return warnings
