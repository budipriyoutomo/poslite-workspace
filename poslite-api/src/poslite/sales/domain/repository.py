from typing import Protocol

from poslite.sales.domain.entities import Order


class OrderRepository(Protocol):
    async def exists(self, order_id: str) -> bool: ...
    async def add(self, order: Order) -> None: ...
