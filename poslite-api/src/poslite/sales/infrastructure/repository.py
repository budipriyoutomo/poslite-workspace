from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from poslite.sales.domain.corrections import OrderForCorrection, OrderVoid, Refund, SoldLine
from poslite.sales.domain.entities import Order
from poslite.sales.domain.services import PriceCalculator
from poslite.sales.infrastructure.models import (
    OrderLineModel,
    OrderLineModifierModel,
    OrderModel,
    OrderVoidModel,
    PaymentModel,
    RefundLineModel,
    RefundModel,
    RefundPaymentModel,
)
from poslite.shared.infrastructure.flush import flush_or_conflict


class SqlAlchemyOrderRepository:
    """Write-only mapping of the Order aggregate; paid orders are never updated (ADR-003)."""

    def __init__(self, session: AsyncSession, tenant_id: str) -> None:
        self._session, self._tenant_id = session, tenant_id

    async def exists(self, order_id: str) -> bool:
        return (
            await self._session.scalar(select(OrderModel.id).where(OrderModel.id == order_id))
        ) is not None

    async def add(self, order: Order) -> None:
        d, tid = order.data, self._tenant_id
        self._session.add(
            OrderModel(
                id=order.id,
                tenant_id=tid,
                outlet_id=order.outlet_id,
                device_id=order.device_id,
                shift_id=d.shift_id,
                receipt_no=d.receipt_no,
                cashier_id=d.cashier_id,
                business_date=order.business_date,
                order_type=d.order_type,
                table_label=d.table_label,
                subtotal=d.totals.subtotal,
                discount_type=d.discount.type if d.discount else None,
                discount_value=d.discount.value if d.discount else None,
                discount_amount=d.totals.discount_amount,
                service_rate_bps=d.rates.service_bps,
                tax_rate_bps=d.rates.tax_bps,
                service_charge=d.totals.service_charge,
                tax=d.totals.tax,
                total=d.totals.total,
                paid_amount=order.paid_amount,
                change_amount=d.change_amount,
                status=order.status,
                flags=list(order.flags),
                created_at=d.occurred_at,
            )
        )
        await flush_or_conflict(
            self._session
        )  # parent rows first: lines/payments reference the order
        for i, line in enumerate(d.lines):
            modifiers_total = sum(m.price for m in line.modifiers)
            gross = (line.unit_price + modifiers_total) * line.quantity
            self._session.add(
                OrderLineModel(
                    id=line.id,
                    tenant_id=tid,
                    order_id=order.id,
                    product_id=line.product_id,
                    product_name=line.product_name,
                    category_name=line.category_name,
                    unit_price=line.unit_price,
                    modifiers_total=modifiers_total,
                    quantity=line.quantity,
                    line_total=gross,
                    notes=line.notes,
                    sort_order=i,
                    discount_type=line.discount.type if line.discount else None,
                    discount_value=line.discount.value if line.discount else None,
                    discount_amount=PriceCalculator.line_discount(gross, line.discount),
                    promotion_id=line.promotion[0] if line.promotion else None,
                    promotion_name=line.promotion[1] if line.promotion else None,
                )
            )
        for payment in d.payments:
            self._session.add(
                PaymentModel(
                    id=payment.id,
                    tenant_id=tid,
                    order_id=order.id,
                    payment_method_id=payment.payment_method_id,
                    method_type=payment.method_type,
                    amount=payment.amount,
                    reference=payment.reference,
                    created_at=d.occurred_at,
                )
            )
        await flush_or_conflict(self._session)
        self._session.add_all(
            OrderLineModifierModel(
                tenant_id=tid,
                order_line_id=line.id,
                modifier_option_id=m.modifier_option_id,
                name=m.name,
                price=m.price,
            )
            for line in d.lines
            for m in line.modifiers
        )
        await flush_or_conflict(self._session)

    async def for_correction(self, order_id: str) -> OrderForCorrection | None:
        order = await self._session.get(OrderModel, order_id)
        if order is None:
            return None
        rows = await self._session.execute(
            select(RefundLineModel.order_line_id, func.sum(RefundLineModel.quantity))
            .join(RefundModel, RefundModel.id == RefundLineModel.refund_id)
            .where(RefundModel.order_id == order_id)
            .group_by(RefundLineModel.order_line_id)
        )
        refunded = {line_id: int(quantity) for line_id, quantity in rows}
        lines = await self._session.scalars(
            select(OrderLineModel)
            .where(OrderLineModel.order_id == order_id)
            .order_by(OrderLineModel.sort_order)
        )
        return OrderForCorrection(
            id=order.id,
            outlet_id=order.outlet_id,
            device_id=order.device_id,
            shift_id=order.shift_id,
            status=order.status,
            business_date=order.business_date,
            total=order.total,
            discount_amount=order.discount_amount,
            lines=tuple(
                SoldLine(
                    id=line.id,
                    product_id=line.product_id,
                    product_name=line.product_name,
                    quantity=line.quantity,
                    gross=line.line_total,
                    line_discount=line.discount_amount,
                    refunded=refunded.get(line.id, 0),
                )
                for line in lines
            ),
            has_refund=bool(refunded),
        )

    async def add_void(self, void: OrderVoid) -> None:
        """The order only changes status; what was sold stays as it was (ADR-003, ADR-023)."""
        self._session.add(
            OrderVoidModel(
                order_id=void.order_id,
                tenant_id=self._tenant_id,
                device_id=void.device_id,
                reason=void.reason,
                voided_by=void.voided_by,
                approved_by=void.approved_by,
                voided_at=void.voided_at,
            )
        )
        await flush_or_conflict(self._session)
        await self._session.execute(
            update(OrderModel).where(OrderModel.id == void.order_id).values(status="voided")
        )

    async def add_refund(self, refund: Refund) -> None:
        tid = self._tenant_id
        self._session.add(
            RefundModel(
                id=refund.id,
                tenant_id=tid,
                outlet_id=refund.outlet_id,
                device_id=refund.device_id,
                shift_id=refund.shift_id,
                order_id=refund.order_id,
                refund_no=refund.refund_no,
                business_date=refund.business_date,
                reason=refund.reason,
                refunded_by=refund.refunded_by,
                approved_by=refund.approved_by,
                total=refund.total,
                flags=list(refund.flags),
                created_at=refund.created_at,
            )
        )
        await flush_or_conflict(self._session)  # parent first: lines and payments reference it
        self._session.add_all(
            RefundLineModel(
                tenant_id=tid,
                refund_id=refund.id,
                order_line_id=line.order_line_id,
                product_id=line.product_id,
                product_name=line.product_name,
                quantity=line.quantity,
                amount=line.amount,
            )
            for line in refund.lines
        )
        self._session.add_all(
            RefundPaymentModel(
                id=p.id,
                tenant_id=tid,
                refund_id=refund.id,
                payment_method_id=p.payment_method_id,
                method_type=p.method_type,
                method_name=p.method_name,
                amount=p.amount,
                reference=p.reference,
            )
            for p in refund.payments
        )
        await flush_or_conflict(self._session)
