from collections.abc import Mapping
from datetime import UTC, datetime

from poslite.integration.infrastructure.service import enqueue
from poslite.sales import api as sales
from poslite.shared.domain.ids import new_ulid
from poslite.shared.infrastructure.outbox_relay import Subscriber
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork


async def on_order_placed(uow: SqlAlchemyUnitOfWork, payload: dict[str, object]) -> None:
    order_id = str(payload["order_id"])
    detail = await sales.order_detail(uow, order_id)
    if detail is None:
        return
    await enqueue(
        uow,
        event_type="order.placed",
        event_key=order_id,
        data=detail,
        new_id=new_ulid,
        now=datetime.now(UTC),
    )


async def on_shift_closed(uow: SqlAlchemyUnitOfWork, payload: dict[str, object]) -> None:
    await enqueue(
        uow,
        event_type="shift.closed",
        event_key=str(payload["shift_id"]),
        data=payload,
        new_id=new_ulid,
        now=datetime.now(UTC),
    )


def subscribers() -> Mapping[str, Subscriber]:
    return {"sales.order_placed": on_order_placed, "shift.closed": on_shift_closed}
