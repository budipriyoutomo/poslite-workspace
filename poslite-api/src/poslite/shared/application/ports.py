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
    # Manual discounts a cashier may give alone, from the outlet's brand (06 Order rule 5).
    cashier_max_discount_percentage: int = 20
    cashier_max_discount_amount: int = 50_000


class OutletPort(Protocol):
    """Current outlet settings, implemented by organization (sales must not read its tables)."""

    async def profile(self, outlet_id: str) -> OutletProfile: ...


class CashierPort(Protocol):
    """Whether a user may work at an outlet, implemented by identity."""

    async def can_work(self, user_id: str, outlet_id: str) -> bool: ...


class QrisPort(Protocol):
    """Dynamic QRIS charges (ADR-019), implemented by payment: which references are charges
    that the gateway has not confirmed as paid. Static QRIS references are never returned."""

    async def unpaid(self, references: list[str]) -> set[str]: ...


class EventRecorder(Protocol):
    def record(self, event: DomainEvent) -> None: ...


class ApproverPort(Protocol):
    """Whether a user holds a permission at an outlet (void/refund approval, ADR-023),
    implemented by identity."""

    async def can_approve(self, user_id: str, outlet_id: str, permission: str) -> bool: ...


class ShiftStatusPort(Protocol):
    """Status of a shift ("open"/"closed"), None when unknown; implemented by shift."""

    async def status(self, shift_id: str) -> str | None: ...


class PaymentMethodPort(Protocol):
    """Which of a sale's payment methods its outlet does not take (doc 11 §3), by payment."""

    async def inactive(self, outlet_id: str, method_ids: list[str]) -> set[str]: ...
