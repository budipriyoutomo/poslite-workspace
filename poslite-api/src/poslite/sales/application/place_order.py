from datetime import datetime
from typing import Protocol

from poslite.sales.domain.discount_policy import DiscountLimits, manual_discounts, needs_approval
from poslite.sales.domain.entities import Order, PlaceOrderData
from poslite.sales.domain.repository import OrderRepository
from poslite.sales.domain.value_objects import Rates
from poslite.shared.application.ports import (
    ApproverPort,
    CashierPort,
    ChannelInfo,
    ChannelPort,
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


class OpenBillPort(Protocol):
    """Shared open bills of a table-service outlet (ADR-031)."""

    async def close(self, bill_id: str, *, outlet_id: str, order_id: str, at: datetime) -> None: ...


class PlaceOrderHandler:
    """order.placed from a device → stored order (+ flags). Never commits (ADR-010)."""

    def __init__(
        self,
        outlets: OutletPort,
        cashiers: CashierPort,
        qris: QrisPort | None = None,
        methods: PaymentMethodPort | None = None,
        approvers: ApproverPort | None = None,
        channels: ChannelPort | None = None,
        bills: OpenBillPort | None = None,
    ) -> None:
        self._outlets, self._cashiers, self._qris = outlets, cashiers, qris
        self._methods, self._approvers, self._channels = methods, approvers, channels
        self._bills = bills

    async def _channel(
        self, cmd: PlaceOrderData, outlet_id: str
    ) -> tuple[ChannelInfo | None, bool]:
        """The order's channel, or — for an older device or a channel the brand no longer has —
        the brand's channel of the order's kind. True when the device's channel was unknown."""
        if self._channels is None:
            return None, False
        if cmd.channel_id is not None:
            found = await self._channels.channel(outlet_id, cmd.channel_id)
            if found is not None:
                return found, False
        return await self._channels.default(outlet_id, cmd.order_type), cmd.channel_id is not None

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
        channel, channel_unknown = await self._channel(cmd, ctx.outlet_id)
        # A rate the channel does not charge is 0 bps (ADR-029 rule 3).
        rates = Rates(
            outlet.service_bps if channel is None or channel.applies_service else 0,
            outlet.tax_bps if channel is None or channel.applies_tax else 0,
            includes_tax=outlet.price_includes_tax,
        )
        order = Order.place(
            cmd,
            outlet_id=ctx.outlet_id,
            device_id=ctx.device_id,
            business_date=business_date(
                cmd.occurred_at, outlet.timezone, outlet.business_day_cutoff
            ),
            current_rates=rates,
            qris_unpaid=qris_unpaid,
            method_inactive=method_inactive,
            discount_unapproved=await self._discount_unapproved(cmd, ctx.outlet_id, limits),
            channel_id=channel.id if channel else None,
            channel_unknown=channel_unknown,
            external_ref_missing=bool(
                channel and channel.requires_external_ref and not cmd.external_ref
            ),
        )
        await uow.orders.add(order)
        for event in order.events:
            uow.record(event)
        # The payment is the truth: it closes the bill whoever holds its lease.
        if cmd.closes_bill_id is not None and self._bills is not None:
            await self._bills.close(
                cmd.closes_bill_id, outlet_id=ctx.outlet_id, order_id=order.id, at=cmd.occurred_at
            )
        return EventOutcome.of(order.flags)
