"""Port to a payment gateway (ADR-017): QRIS charges, payment links and signed notifications.

Adapters: FakeGateway (dev/test/e2e) today; Midtrans or Xendit once a vendor is chosen.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Protocol

NotificationStatus = Literal["paid", "expired", "failed"]


@dataclass(frozen=True, slots=True)
class GatewayCharge:
    gateway_ref: str
    payment_url: str | None = None
    qr_string: str | None = None
    expires_at: datetime | None = None


@dataclass(frozen=True, slots=True)
class GatewayNotification:
    gateway_ref: str
    status: NotificationStatus
    occurred_at: datetime


class PaymentGateway(Protocol):
    async def create_qris(
        self, *, reference: str, amount: int, expires_at: datetime
    ) -> GatewayCharge: ...

    async def create_payment_link(
        self, *, reference: str, amount: int, description: str
    ) -> GatewayCharge: ...

    def parse_notification(self, body: bytes, headers: Mapping[str, str]) -> GatewayNotification:
        """Verify the vendor's signature; raise DomainError INVALID_SIGNATURE otherwise."""
        ...
