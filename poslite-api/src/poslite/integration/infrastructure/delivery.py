from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.integration.domain.webhooks import next_retry_delay, sign
from poslite.integration.infrastructure.models import WebhookDeliveryModel, WebhookEndpointModel

# POST body to url with headers → HTTP status; raises on network errors.
Send = Callable[[str, bytes, dict[str, str]], Awaitable[int]]


@dataclass(frozen=True, slots=True)
class DeliveryStats:
    delivered: int
    failed: int


async def deliver_webhooks(
    *,
    system: async_sessionmaker[AsyncSession],
    send: Send,
    now: Callable[[], datetime],
    batch_size: int = 50,
) -> DeliveryStats:
    """Send due deliveries of every tenant (ADR-020). Claimed with SKIP LOCKED as poslite_system,
    so two workers never send the same one; each result is saved with the batch."""
    delivered = failed = 0
    moment = now()
    async with system() as session, session.begin():
        rows = (
            await session.execute(
                select(WebhookDeliveryModel, WebhookEndpointModel)
                .join(
                    WebhookEndpointModel,
                    WebhookEndpointModel.id == WebhookDeliveryModel.endpoint_id,
                )
                .where(
                    WebhookDeliveryModel.status == "pending",
                    or_(
                        WebhookDeliveryModel.attempts == 0,
                        WebhookDeliveryModel.next_attempt_at <= moment,
                    ),
                )
                .order_by(WebhookDeliveryModel.created_at)
                .limit(batch_size)
                .with_for_update(of=WebhookDeliveryModel, skip_locked=True)
            )
        ).all()
        for delivery, endpoint in rows:
            if not endpoint.is_active or endpoint.deleted_at is not None:
                delivery.status, delivery.last_error = "dead", "endpoint disabled"
                continue
            body = delivery.body.encode()
            headers = {
                "Content-Type": "application/json",
                "X-Poslite-Event": delivery.event_type,
                "X-Poslite-Signature": sign(endpoint.secret, int(moment.timestamp()), body),
            }
            status: int | None = None
            error: str | None = None
            try:
                status = await send(endpoint.url, body, headers)
            except Exception as err:  # network error: same as a failed status
                error = str(err)[:500]
            if status is not None and 200 <= status < 300:
                delivery.status, delivery.delivered_at = "delivered", moment
                delivery.last_status_code, delivery.last_error = status, None
                delivered += 1
                continue
            delivery.attempts += 1
            delivery.last_status_code, delivery.last_error = status, error
            delay = next_retry_delay(delivery.attempts)
            if delay is None:
                delivery.status = "dead"
            else:
                delivery.next_attempt_at = moment + delay
            failed += 1
    return DeliveryStats(delivered, failed)
