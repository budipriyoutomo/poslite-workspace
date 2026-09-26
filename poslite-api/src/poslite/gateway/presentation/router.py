from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.billing import api as billing
from poslite.payment import api as payment
from poslite.shared.application.payment_gateway import GatewayNotification, PaymentGateway
from poslite.shared.infrastructure.fake_gateway import FakeGateway
from poslite.shared.presentation.dependencies import payment_gateway, system_sessions
from poslite.shared.presentation.envelope import ApiResponse, ok

router = APIRouter(prefix="/gateway", tags=["gateway"])
System = Annotated[async_sessionmaker[AsyncSession], Depends(system_sessions)]
Gateway = Annotated[PaymentGateway, Depends(payment_gateway)]


async def _dispatch(system: async_sessionmaker[AsyncSession], note: GatewayNotification) -> bool:
    """Route a verified notification to whatever the reference belongs to (idempotent)."""
    if note.status != "paid":
        return False
    async with system() as session, session.begin():
        return await billing.mark_invoice_paid(
            session, note.gateway_ref, note.occurred_at
        ) or await payment.mark_qris_paid(session, note.gateway_ref, note.occurred_at)


@router.post("/webhook")
async def webhook(
    request: Request, system: System, gateway: Gateway
) -> ApiResponse[dict[str, bool]]:
    """Payment notifications from the gateway (ADR-017). The signature is checked first; an
    unknown reference still answers 200 so the vendor stops retrying."""
    note = gateway.parse_notification(await request.body(), dict(request.headers))
    return ok({"handled": await _dispatch(system, note)})


def _fake(gateway: PaymentGateway) -> FakeGateway:
    if not isinstance(gateway, FakeGateway):
        raise HTTPException(status_code=404)
    return gateway


@router.get("/fake/pay/{gateway_ref}", response_class=HTMLResponse, include_in_schema=False)
async def fake_checkout(gateway_ref: str, gateway: Gateway) -> str:
    _fake(gateway)
    return f"""<!doctype html><meta charset="utf-8"><title>Fake checkout</title>
<body style="font-family:sans-serif;max-width:28rem;margin:4rem auto">
<h1>Fake payment gateway</h1><p>Referensi <code>{gateway_ref}</code> (hanya untuk pengembangan).</p>
<form method="post"><button style="font-size:1.2rem;padding:.6rem 1.2rem">Bayar</button>
</form></body>"""


@router.post("/fake/pay/{gateway_ref}", include_in_schema=False)
async def fake_pay(
    gateway_ref: str, system: System, gateway: Gateway
) -> ApiResponse[dict[str, bool]]:
    """Development only: pay as a customer would, through the same signed notification path."""
    fake = _fake(gateway)
    body, headers = fake.notification(gateway_ref, "paid", datetime.now(UTC))
    return ok({"handled": await _dispatch(system, fake.parse_notification(body, headers))})
