from dataclasses import dataclass
from datetime import time
from typing import Protocol

from poslite.shared.domain.events import DomainEvent


@dataclass(frozen=True, slots=True)
class OutletProfile:
    service_bps: int
    tax_bps: int
    timezone: str
    business_day_cutoff: time


class OutletPort(Protocol):
    """Current outlet settings, implemented by organization (sales must not read its tables)."""

    async def profile(self, outlet_id: str) -> OutletProfile: ...


class CashierPort(Protocol):
    """Whether a user may work at an outlet, implemented by identity."""

    async def can_work(self, user_id: str, outlet_id: str) -> bool: ...


class EventRecorder(Protocol):
    def record(self, event: DomainEvent) -> None: ...
