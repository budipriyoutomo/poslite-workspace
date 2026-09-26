import hashlib
import hmac
import json
from collections.abc import Mapping
from datetime import datetime

from poslite.shared.application.payment_gateway import (
    GatewayCharge,
    GatewayNotification,
    NotificationStatus,
)
from poslite.shared.domain.errors import DomainError

SIGNATURE_HEADER = "X-Fake-Signature"


class FakeGateway:
    """Stand-in payment gateway (ADR-017): charges are paid by POSTing to its fake checkout,
    which sends the same kind of signed notification a real vendor would."""

    def __init__(self, *, secret: str, public_url: str) -> None:
        self._secret = secret.encode()
        self._public_url = public_url.rstrip("/")

    def _checkout(self, gateway_ref: str) -> str:
        return f"{self._public_url}/api/v1/gateway/fake/pay/{gateway_ref}"

    async def create_qris(
        self, *, reference: str, amount: int, expires_at: datetime
    ) -> GatewayCharge:
        ref = f"fake_{reference}"
        # Not a scannable EMVCo payload: the fake is paid from its checkout page, not a wallet.
        return GatewayCharge(ref, self._checkout(ref), f"FAKEQRIS|{ref}|{amount}", expires_at)

    async def create_payment_link(
        self, *, reference: str, amount: int, description: str
    ) -> GatewayCharge:
        ref = f"fake_{reference}"
        return GatewayCharge(ref, self._checkout(ref))

    def _sign(self, body: bytes) -> str:
        return hmac.new(self._secret, body, hashlib.sha256).hexdigest()

    def notification(
        self, gateway_ref: str, status: NotificationStatus, occurred_at: datetime
    ) -> tuple[bytes, dict[str, str]]:
        body = json.dumps(
            {"gateway_ref": gateway_ref, "status": status, "occurred_at": occurred_at.isoformat()}
        ).encode()
        return body, {SIGNATURE_HEADER: self._sign(body)}

    def parse_notification(self, body: bytes, headers: Mapping[str, str]) -> GatewayNotification:
        given = {k.lower(): v for k, v in headers.items()}.get(SIGNATURE_HEADER.lower(), "")
        if not hmac.compare_digest(given, self._sign(body)):
            raise DomainError(
                "INVALID_SIGNATURE", "Notification signature is invalid", kind="unauthorized"
            )
        data = json.loads(body)
        return GatewayNotification(
            data["gateway_ref"], data["status"], datetime.fromisoformat(data["occurred_at"])
        )
