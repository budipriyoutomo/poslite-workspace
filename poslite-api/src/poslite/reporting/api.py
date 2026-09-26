"""Public API of the reporting module: outbox subscribers for the relay, and the rebuild command."""

from collections.abc import Mapping

from poslite.reporting.infrastructure.projector import on_order_placed, project_daily_sales
from poslite.reporting.infrastructure.rebuild import rebuild
from poslite.shared.infrastructure.outbox_relay import Subscriber


def subscribers() -> Mapping[str, Subscriber]:
    return {"sales.order_placed": on_order_placed}


__all__ = ["project_daily_sales", "rebuild", "subscribers"]
