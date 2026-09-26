from typing import Protocol

from poslite.sales.domain.entities import Order, PlaceOrderData
from poslite.sales.domain.repository import OrderRepository
from poslite.sales.domain.value_objects import Rates
from poslite.shared.application.ports import CashierPort, EventRecorder, OutletPort
from poslite.shared.application.sync import DeviceContext, EventOutcome
from poslite.shared.domain.business_date import business_date
from poslite.shared.domain.errors import DomainError


class SalesUnitOfWork(EventRecorder, Protocol):
    orders: OrderRepository


class PlaceOrderHandler:
    """order.placed from a device → stored order (+ flags). Never commits (ADR-010)."""

    def __init__(self, outlets: OutletPort, cashiers: CashierPort) -> None:
        self._outlets, self._cashiers = outlets, cashiers

    async def __call__(
        self, cmd: PlaceOrderData, ctx: DeviceContext, uow: SalesUnitOfWork
    ) -> EventOutcome:
        if await uow.orders.exists(cmd.order_id):
            raise DomainError(
                "ORDER_ALREADY_EXISTS", "An order with this id already exists", kind="conflict"
            )
        if not await self._cashiers.can_work(cmd.cashier_id, ctx.outlet_id):
            raise DomainError(
                "CASHIER_NOT_IN_OUTLET", "Cashier does not work at this outlet", kind="forbidden"
            )
        outlet = await self._outlets.profile(ctx.outlet_id)
        order = Order.place(
            cmd,
            outlet_id=ctx.outlet_id,
            device_id=ctx.device_id,
            business_date=business_date(
                cmd.occurred_at, outlet.timezone, outlet.business_day_cutoff
            ),
            current_rates=Rates(outlet.service_bps, outlet.tax_bps),
        )
        await uow.orders.add(order)
        for event in order.events:
            uow.record(event)
        return EventOutcome.of(order.flags)
