import json
import secrets
from collections.abc import Callable
from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert

from poslite.integration.application.schemas import (
    CreatedEndpointOut,
    DeliveryOut,
    EndpointIn,
    EndpointOut,
)
from poslite.integration.infrastructure.models import WebhookDeliveryModel, WebhookEndpointModel
from poslite.shared.domain.errors import DomainError
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork


def _out(e: WebhookEndpointModel) -> EndpointOut:
    return EndpointOut(
        id=e.id,
        url=e.url,
        event_types=list(e.event_types),
        brand_ids=list(e.brand_ids),
        is_active=e.is_active,
    )


async def create_endpoint(
    uow: SqlAlchemyUnitOfWork, new_id: Callable[[], str], body: EndpointIn
) -> CreatedEndpointOut:
    row = WebhookEndpointModel(
        id=new_id(),
        tenant_id=uow.tenant_id,
        url=str(body.url),
        secret=f"whsec_{secrets.token_urlsafe(24)}",
        event_types=list(body.event_types),
        brand_ids=list(dict.fromkeys(body.brand_ids)),
    )
    uow.session.add(row)
    await uow.session.flush()
    return CreatedEndpointOut(**_out(row).model_dump(), secret=row.secret)


async def list_endpoints(uow: SqlAlchemyUnitOfWork) -> list[EndpointOut]:
    rows = await uow.session.scalars(
        select(WebhookEndpointModel)
        .where(WebhookEndpointModel.deleted_at.is_(None))
        .order_by(WebhookEndpointModel.created_at)
    )
    return [_out(e) for e in rows]


async def _live(uow: SqlAlchemyUnitOfWork, endpoint_id: str) -> WebhookEndpointModel:
    row = await uow.session.get(WebhookEndpointModel, endpoint_id)
    if row is None or row.deleted_at is not None:
        raise DomainError("WEBHOOK_NOT_FOUND", "Webhook endpoint not found", kind="not_found")
    return row


async def delete_endpoint(uow: SqlAlchemyUnitOfWork, endpoint_id: str) -> None:
    row = await _live(uow, endpoint_id)
    row.deleted_at, row.is_active = func.now(), False
    await uow.session.flush()


async def list_deliveries(uow: SqlAlchemyUnitOfWork, endpoint_id: str) -> list[DeliveryOut]:
    await _live(uow, endpoint_id)
    rows = await uow.session.scalars(
        select(WebhookDeliveryModel)
        .where(WebhookDeliveryModel.endpoint_id == endpoint_id)
        .order_by(WebhookDeliveryModel.created_at.desc())
        .limit(200)
    )
    return [DeliveryOut.model_validate(d, from_attributes=True) for d in rows]


async def retry_delivery(uow: SqlAlchemyUnitOfWork, delivery_id: str) -> None:
    """Send again on the next run, with a fresh set of attempts (same body, same event id)."""
    row = await uow.session.get(WebhookDeliveryModel, delivery_id)
    if row is None:
        raise DomainError("DELIVERY_NOT_FOUND", "Delivery not found", kind="not_found")
    row.status, row.attempts, row.next_attempt_at = "pending", 0, func.now()
    await uow.session.flush()


async def enqueue(
    uow: SqlAlchemyUnitOfWork,
    *,
    event_type: str,
    event_key: str,
    brand_id: str,
    data: dict[str, object],
    new_id: Callable[[], str],
    now: datetime,
) -> None:
    """One delivery per subscribed endpoint; a repeated event (at-least-once relay) is ignored.
    An endpoint limited to brands only gets events of those brands (ADR-022)."""
    endpoints = await uow.session.scalars(
        select(WebhookEndpointModel).where(
            WebhookEndpointModel.is_active,
            WebhookEndpointModel.deleted_at.is_(None),
            WebhookEndpointModel.event_types.contains([event_type]),
            or_(
                func.cardinality(WebhookEndpointModel.brand_ids) == 0,
                WebhookEndpointModel.brand_ids.contains([brand_id]),
            ),
        )
    )
    for endpoint in endpoints:
        event_id = new_id()
        body = json.dumps(
            {"id": event_id, "type": event_type, "created_at": now.isoformat(), "data": data},
            separators=(",", ":"),
            sort_keys=True,
        )
        await uow.session.execute(
            insert(WebhookDeliveryModel)
            .values(
                id=event_id,
                tenant_id=uow.tenant_id,
                endpoint_id=endpoint.id,
                event_type=event_type,
                event_key=event_key,
                body=body,
                next_attempt_at=now,
            )
            .on_conflict_do_nothing(constraint="uq_delivery_event")
        )
