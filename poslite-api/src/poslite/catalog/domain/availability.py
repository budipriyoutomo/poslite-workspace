"""Sold out from the POS (P1-2): an outlet's availability changed on a device, maybe offline."""

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True, slots=True)
class ChangeAvailability:
    product_id: str
    is_available: bool
    until: datetime | None  # a sold-out mark lifts by itself then; None = until switched back on
    changed_by: str
    occurred_at: datetime


def is_newer(change_at: datetime, last_change_at: datetime | None) -> bool:
    """Devices sync late and in any order: the change made last wins, not the one synced last."""
    return last_change_at is None or change_at >= last_change_at
