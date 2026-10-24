"""Public API of the reporting module: outbox subscribers for the relay, and the rebuild command."""

from collections.abc import Mapping

from poslite.reporting.infrastructure.projector import on_order_placed, project_daily_sales
from poslite.reporting.infrastructure.rebuild import rebuild
from poslite.shared.infrastructure.outbox_relay import Subscriber


def subscribers() -> Mapping[str, Subscriber]:
    # Each payload names the outlet and the business day to re-aggregate (the order's day for a
    # void, the refund's own day for a refund — ADR-023, the void's own day for a bill — ADR-028).
    return {
        "sales.order_placed": on_order_placed,
        "sales.order_voided": on_order_placed,
        "sales.order_refunded": on_order_placed,
        "sales.bill_items_voided": on_order_placed,
    }


__all__ = ["project_daily_sales", "rebuild", "subscribers"]
