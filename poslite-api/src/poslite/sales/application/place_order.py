from typing import Protocol

from poslite.sales.domain.discount_policy import DiscountLimits, manual_discounts, needs_approval
from poslite.sales.domain.entities import Order, PlaceOrderData
from poslite.sales.domain.repository import OrderRepository
from poslite.sales.domain.value_objects import Rates
from poslite.shared.application.ports import (
    ApproverPort,
    CashierPort,
    EventRecorder,
    OutletPort,
    PaymentMethodPort,
    QrisPort,
)
from poslite.shared.application.sync import DeviceContext, EventOutcome
from poslite.shared.domain.business_date import business_date
from poslite.shared.domain.errors import DomainError


class SalesUnitOfWork(EventRecorder, Protocol):
    orders: OrderRepository


class PlaceOrderHandler:
    """order.placed from a device → stored order (+ flags). Never commits (ADR-010)."""

    def __init__(
        self,
        outlets: OutletPort,
        cashiers: CashierPort,
        qris: QrisPort | None = None,
        methods: PaymentMethodPort | None = None,
        approvers: ApproverPort | None = None,
    ) -> None:
        self._outlets, self._cashiers, self._qris = outlets, cashiers, qris
        self._methods, self._approvers = methods, approvers

    async def _discount_unapproved(
        self, cmd: PlaceOrderData, outlet_id: str, limits: DiscountLimits
    ) -> bool:
        """Over the brand's cashier limit, neither the cashier nor an approver may give it."""
        if self._approvers is None:
            return False
        percentages, amount = manual_discounts(cmd.lines, cmd.discount)
        allowed = await self._approvers.can_approve(cmd.cashier_id, outlet_id, "discount.override")
        role = "manager" if allowed else "cashier"
        if not needs_approval(
            role=role, manual_percentages=percentages, manual_amount=amount, limits=limits
        ):
            return False
        approver = cmd.discount_approved_by
        return approver is None or not await self._approvers.can_approve(
            approver, outlet_id, "discount.override"
        )

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
        limits = DiscountLimits(
            outlet.cashier_max_discount_percentage, outlet.cashier_max_discount_amount
        )
        qris_refs = [p.reference for p in cmd.payments if p.method_type == "qris" and p.reference]
        qris_unpaid = bool(self._qris and qris_refs and await self._qris.unpaid(qris_refs))
        # The device's list of methods may be stale offline: accept the sale, flag it.
        method_inactive = bool(
            self._methods
            and await self._methods.inactive(
                ctx.outlet_id, sorted({p.payment_method_id for p in cmd.payments})
            )
        )
        order = Order.place(
            cmd,
            outlet_id=ctx.outlet_id,
            device_id=ctx.device_id,
            business_date=business_date(
                cmd.occurred_at, outlet.timezone, outlet.business_day_cutoff
            ),
            current_rates=Rates(outlet.service_bps, outlet.tax_bps),
            qris_unpaid=qris_unpaid,
            method_inactive=method_inactive,
            discount_unapproved=await self._discount_unapproved(cmd, ctx.outlet_id, limits),
        )
        await uow.orders.add(order)
        for event in order.events:
            uow.record(event)
        return EventOutcome.of(order.flags)
