from collections.abc import Mapping
from datetime import UTC, date, datetime

from poslite.integration.infrastructure.service import enqueue
from poslite.organization import api as organization
from poslite.sales import api as sales
from poslite.shared.domain.ids import new_ulid
from poslite.shared.infrastructure.outbox_relay import Subscriber
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork


async def on_order_placed(uow: SqlAlchemyUnitOfWork, payload: dict[str, object]) -> None:
    order_id = str(payload["order_id"])
    detail = await sales.order_detail(uow, order_id)
    if detail is None:
        return
    brand_id = await organization.brand_of_outlet(uow, str(detail["outlet_id"]))
    await enqueue(
        uow,
        event_type="order.placed",
        event_key=order_id,
        brand_id=brand_id,
        data=detail | {"brand_id": brand_id},
        new_id=new_ulid,
        now=datetime.now(UTC),
    )


async def on_shift_closed(uow: SqlAlchemyUnitOfWork, payload: dict[str, object]) -> None:
    brand_id = await organization.brand_of_outlet(uow, str(payload["outlet_id"]))
    await enqueue(
        uow,
        event_type="shift.closed",
        event_key=str(payload["shift_id"]),
        brand_id=brand_id,
        data=payload | {"brand_id": brand_id},
        new_id=new_ulid,
        now=datetime.now(UTC),
    )


async def on_order_voided(uow: SqlAlchemyUnitOfWork, payload: dict[str, object]) -> None:
    """The whole order, now with status `voided` and its void record (ADR-023)."""
    order_id = str(payload["order_id"])
    detail = await sales.order_detail(uow, order_id)
    if detail is None:
        return
    brand_id = await organization.brand_of_outlet(uow, str(detail["outlet_id"]))
    await enqueue(
        uow,
        event_type="order.voided",
        event_key=order_id,
        brand_id=brand_id,
        data=detail | {"brand_id": brand_id},
        new_id=new_ulid,
        now=datetime.now(UTC),
    )


async def on_order_refunded(uow: SqlAlchemyUnitOfWork, payload: dict[str, object]) -> None:
    refund_id = str(payload["refund_id"])
    detail = await sales.refund_detail(uow, refund_id)
    if detail is None:
        return
    brand_id = await organization.brand_of_outlet(uow, str(detail["outlet_id"]))
    await enqueue(
        uow,
        event_type="order.refunded",
        event_key=refund_id,
        brand_id=brand_id,
        data=detail | {"brand_id": brand_id},
        new_id=new_ulid,
        now=datetime.now(UTC),
    )


async def on_bill_items_voided(uow: SqlAlchemyUnitOfWork, payload: dict[str, object]) -> None:
    """Items cancelled from an open bill after the kitchen had them (ADR-028): waste to book."""
    void_id = str(payload["void_id"])
    detail = await sales.bill_void_detail(uow, void_id)
    if detail is None:
        return
    brand_id = await organization.brand_of_outlet(uow, str(detail["outlet_id"]))
    data = {k: v.isoformat() if isinstance(v, date | datetime) else v for k, v in detail.items()}
    await enqueue(
        uow,
        event_type="bill.item_voided",
        event_key=void_id,
        brand_id=brand_id,
        data=data | {"brand_id": brand_id},
        new_id=new_ulid,
        now=datetime.now(UTC),
    )


def subscribers() -> Mapping[str, Subscriber]:
    return {
        "sales.order_placed": on_order_placed,
        "shift.closed": on_shift_closed,
        "sales.order_voided": on_order_voided,
        "sales.order_refunded": on_order_refunded,
        "sales.bill_items_voided": on_bill_items_voided,
    }
