from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from poslite.sales.domain.entities import Order
from poslite.sales.infrastructure.models import (
    OrderLineModel,
    OrderLineModifierModel,
    OrderModel,
    PaymentModel,
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
                    line_total=(line.unit_price + modifiers_total) * line.quantity,
                    notes=line.notes,
                    sort_order=i,
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
