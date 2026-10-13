"""order.voided / order.refunded from a device (ADR-023). Never commit (ADR-010)."""

from poslite.sales.application.place_order import SalesUnitOfWork
from poslite.sales.domain.corrections import (
    OrderForCorrection,
    OrderVoid,
    Refund,
    RefundOrderData,
    VoidOrderData,
)
from poslite.shared.application.ports import (
    ApproverPort,
    CashierPort,
    OutletPort,
    ShiftStatusPort,
)
from poslite.shared.application.sync import DeviceContext, EventOutcome
from poslite.shared.domain.business_date import business_date
from poslite.shared.domain.errors import DomainError


async def _order(uow: SalesUnitOfWork, order_id: str, ctx: DeviceContext) -> OrderForCorrection:
    """An order of this device's outlet; any other outlet's order is simply not found."""
    order = await uow.orders.for_correction(order_id)
    if order is None or order.outlet_id != ctx.outlet_id:
        raise DomainError("ORDER_NOT_FOUND", "Order not found at this outlet", kind="not_found")
    return order


async def _check_people(
    cashiers: CashierPort,
    approvers: ApproverPort,
    ctx: DeviceContext,
    *,
    actor: str,
    approved_by: str | None,
    permission: str,
) -> None:
    """The cashier works here; whoever approved (or the cashier, without an approver) holds
    the permission at this outlet — PIN approval happened offline on the device."""
    if not await cashiers.can_work(actor, ctx.outlet_id):
        raise DomainError(
            "CASHIER_NOT_IN_OUTLET", "Cashier does not work at this outlet", kind="forbidden"
        )
    if not await approvers.can_approve(approved_by or actor, ctx.outlet_id, permission):
        raise DomainError(
            "APPROVER_NOT_ALLOWED", f"Approver lacks {permission} at this outlet", kind="forbidden"
        )


class VoidOrderHandler:
    def __init__(
        self, cashiers: CashierPort, approvers: ApproverPort, shifts: ShiftStatusPort
    ) -> None:
        self._cashiers, self._approvers, self._shifts = cashiers, approvers, shifts

    async def __call__(
        self, cmd: VoidOrderData, ctx: DeviceContext, uow: SalesUnitOfWork
    ) -> EventOutcome:
        order = await _order(uow, cmd.order_id, ctx)
        await _check_people(
            self._cashiers,
            self._approvers,
            ctx,
            actor=cmd.voided_by,
            approved_by=cmd.approved_by,
            permission="order.void",
        )
        shift_open = await self._shifts.status(order.shift_id) == "open"
        void = OrderVoid.of(order, cmd, device_id=ctx.device_id, shift_open=shift_open)
        await uow.orders.add_void(void)
        for event in void.events:
            uow.record(event)
        return EventOutcome.of(())


class RefundOrderHandler:
    def __init__(
        self,
        outlets: OutletPort,
        cashiers: CashierPort,
        approvers: ApproverPort,
        shifts: ShiftStatusPort,
    ) -> None:
        self._outlets, self._cashiers = outlets, cashiers
        self._approvers, self._shifts = approvers, shifts

    async def __call__(
        self, cmd: RefundOrderData, ctx: DeviceContext, uow: SalesUnitOfWork
    ) -> EventOutcome:
        order = await _order(uow, cmd.order_id, ctx)
        await _check_people(
            self._cashiers,
            self._approvers,
            ctx,
            actor=cmd.refunded_by,
            approved_by=cmd.approved_by,
            permission="order.refund",
        )
        if await self._shifts.status(cmd.shift_id) is None:
            raise DomainError("SHIFT_NOT_FOUND", "Refund shift not found", kind="not_found")
        outlet = await self._outlets.profile(ctx.outlet_id)
        refund = Refund.record(
            order,
            cmd,
            device_id=ctx.device_id,
            business_date=business_date(
                cmd.occurred_at, outlet.timezone, outlet.business_day_cutoff
            ),
        )
        await uow.orders.add_refund(refund)
        for event in refund.events:
            uow.record(event)
        return EventOutcome.of(refund.flags)
