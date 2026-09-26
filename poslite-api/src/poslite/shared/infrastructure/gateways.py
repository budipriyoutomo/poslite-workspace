from poslite.shared.application.payment_gateway import PaymentGateway
from poslite.shared.config import Settings
from poslite.shared.infrastructure.fake_gateway import FakeGateway


def build_gateway(settings: Settings) -> PaymentGateway:
    """The configured adapter (ADR-017). Only the fake exists until a vendor is chosen."""
    return FakeGateway(secret=settings.gateway_secret, public_url=settings.public_api_url)
