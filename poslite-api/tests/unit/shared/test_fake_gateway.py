from datetime import UTC, datetime

import pytest

from poslite.shared.domain.errors import DomainError
from poslite.shared.infrastructure.fake_gateway import FakeGateway

T = datetime(2026, 9, 27, 3, 0, tzinfo=UTC)
gateway = FakeGateway(secret="fake-secret", public_url="http://localhost:8000")  # noqa: S106


async def test_a_payment_link_points_at_the_fake_checkout() -> None:
    charge = await gateway.create_payment_link(
        reference="INV1", amount=150_000, description="Langganan"
    )

    assert charge.gateway_ref == "fake_INV1"
    assert charge.payment_url == "http://localhost:8000/api/v1/gateway/fake/pay/fake_INV1"
    assert charge.qr_string is None


async def test_a_qris_charge_carries_a_qr_payload_and_expiry() -> None:
    charge = await gateway.create_qris(reference="QR1", amount=41_580, expires_at=T)

    assert charge.gateway_ref == "fake_QR1"
    assert charge.qr_string is not None
    assert "41580" in charge.qr_string
    assert charge.expires_at == T


def test_reads_a_correctly_signed_notification() -> None:
    body, headers = gateway.notification("fake_INV1", "paid", T)

    note = gateway.parse_notification(body, headers)

    assert (note.gateway_ref, note.status, note.occurred_at) == ("fake_INV1", "paid", T)


def test_rejects_a_forged_notification() -> None:
    body, headers = gateway.notification("fake_INV1", "paid", T)

    with pytest.raises(DomainError) as err:
        gateway.parse_notification(body.replace(b"paid", b"PAID"), headers)

    assert err.value.code == "INVALID_SIGNATURE"
