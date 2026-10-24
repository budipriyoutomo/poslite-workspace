from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import ColumnElement, and_, func, select

from poslite.sales.infrastructure.models import (
    BillVoidLineModel,
    BillVoidModel,
    OrderLineModel,
    OrderLineModifierModel,
    OrderModel,
    OrderVoidModel,
    PaymentModel,
    RefundLineModel,
    RefundModel,
    RefundPaymentModel,
)
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork


@dataclass(frozen=True, slots=True)
class DailyTotals:
    gross: int
    discount: int
    service: int
    tax: int
    net: int
    order_count: int
    void_count: int
    refund_amount: int = 0
    refund_count: int = 0
    pre_payment_void_count: int = 0  # bill items cancelled after the kitchen had them (ADR-028)
    pre_payment_void_amount: int = 0


@dataclass(frozen=True, slots=True)
class ProductSales:
    product_id: str
    product_name: str
    quantity: int
    gross: int
    refund_qty: int = 0
    refund_amount: int = 0


@dataclass(frozen=True, slots=True)
class PaymentSales:
    payment_method_id: str
    method_type: str
    amount: int
    count: int
    refund_amount: int = 0


def _refund_day(outlet_id: str, day: date) -> ColumnElement[bool]:
    """Refunds count on the day they were paid out, not on the order's day (ADR-023)."""
    return and_(RefundModel.outlet_id == outlet_id, RefundModel.business_date == day)


def _day(outlet_id: str, day: date) -> ColumnElement[bool]:
    return and_(OrderModel.outlet_id == outlet_id, OrderModel.business_date == day)


async def daily_totals(uow: SqlAlchemyUnitOfWork, outlet_id: str, day: date) -> DailyTotals:
    paid = OrderModel.status == "paid"
    row = (
        await uow.session.execute(
            select(
                func.coalesce(func.sum(OrderModel.subtotal).filter(paid), 0),
                func.coalesce(func.sum(OrderModel.discount_amount).filter(paid), 0),
                func.coalesce(func.sum(OrderModel.service_charge).filter(paid), 0),
                func.coalesce(func.sum(OrderModel.tax).filter(paid), 0),
                func.coalesce(func.sum(OrderModel.total).filter(paid), 0),
                func.count().filter(paid),
                func.count().filter(OrderModel.status == "voided"),
            ).where(_day(outlet_id, day))
        )
    ).one()
    refunds = (
        await uow.session.execute(
            select(func.coalesce(func.sum(RefundModel.total), 0), func.count()).where(
                _refund_day(outlet_id, day)
            )
        )
    ).one()
    bill_voids = (
        await uow.session.execute(
            select(func.count(), func.coalesce(func.sum(BillVoidModel.amount), 0)).where(
                BillVoidModel.outlet_id == outlet_id, BillVoidModel.business_date == day
            )
        )
    ).one()
    return DailyTotals(*(int(v) for v in (*row, *refunds, *bill_voids)))


async def daily_product_sales(
    uow: SqlAlchemyUnitOfWork, outlet_id: str, day: date
) -> list[ProductSales]:
    rows = await uow.session.execute(
        select(
            OrderLineModel.product_id,
            func.max(OrderLineModel.product_name),
            func.sum(OrderLineModel.quantity),
            func.sum(OrderLineModel.line_total),
        )
        .join(OrderModel, OrderModel.id == OrderLineModel.order_id)
        .where(_day(outlet_id, day), OrderModel.status == "paid")
        .group_by(OrderLineModel.product_id)
    )
    sold = {pid: ProductSales(pid, name, int(qty), int(gross)) for pid, name, qty, gross in rows}
    refunded = await uow.session.execute(
        select(
            RefundLineModel.product_id,
            func.max(RefundLineModel.product_name),
            func.sum(RefundLineModel.quantity),
            func.sum(RefundLineModel.amount),
        )
        .join(RefundModel, RefundModel.id == RefundLineModel.refund_id)
        .where(_refund_day(outlet_id, day))
        .group_by(RefundLineModel.product_id)
    )
    for pid, name, qty, amount in refunded:
        base = sold.get(pid, ProductSales(pid, name, 0, 0))
        sold[pid] = ProductSales(
            pid, base.product_name, base.quantity, base.gross, int(qty), int(amount)
        )
    return list(sold.values())


async def daily_payment_sales(
    uow: SqlAlchemyUnitOfWork, outlet_id: str, day: date
) -> list[PaymentSales]:
    """Takings per payment method; change is handed back from cash, so cash is counted net of it."""
    rows = await uow.session.execute(
        select(
            OrderModel.id,
            OrderModel.change_amount,
            PaymentModel.payment_method_id,
            PaymentModel.method_type,
            PaymentModel.amount,
        )
        .join(PaymentModel, PaymentModel.order_id == OrderModel.id)
        .where(_day(outlet_id, day), OrderModel.status == "paid")
        .order_by(OrderModel.id, PaymentModel.id)
    )
    totals: dict[tuple[str, str], list[int]] = defaultdict(lambda: [0, 0])
    change_left: dict[str, int] = {}
    for order_id, change, method_id, method_type, amount in rows:
        change_left.setdefault(order_id, change)
        kept = amount
        if method_type == "cash":
            taken = min(change_left[order_id], amount)
            change_left[order_id] -= taken
            kept -= taken
        bucket = totals[(method_id, method_type)]
        bucket[0] += kept
        bucket[1] += 1
    refunded = await uow.session.execute(
        select(
            RefundPaymentModel.payment_method_id,
            RefundPaymentModel.method_type,
            func.sum(RefundPaymentModel.amount),
        )
        .join(RefundModel, RefundModel.id == RefundPaymentModel.refund_id)
        .where(_refund_day(outlet_id, day))
        .group_by(RefundPaymentModel.payment_method_id, RefundPaymentModel.method_type)
    )
    refunds = {(m, t): int(a) for m, t, a in refunded}
    keys = list(totals) + [k for k in refunds if k not in totals]
    return [
        PaymentSales(m, t, totals[(m, t)][0], totals[(m, t)][1], refunds.get((m, t), 0))
        for m, t in keys
    ]


@dataclass(frozen=True, slots=True)
class OrderSummary:
    id: str
    receipt_no: str
    business_date: date
    cashier_id: str
    total: int
    status: str
    flags: list[str]
    created_at: datetime


async def list_orders(uow: SqlAlchemyUnitOfWork, outlet_id: str, day: date) -> list[OrderSummary]:
    rows = await uow.session.scalars(
        select(OrderModel)
        .where(_day(outlet_id, day))
        .order_by(OrderModel.created_at, OrderModel.receipt_no)
    )
    return [
        OrderSummary(
            o.id,
            o.receipt_no,
            o.business_date,
            o.cashier_id,
            o.total,
            o.status,
            list(o.flags),
            o.created_at,
        )
        for o in rows
    ]


@dataclass(frozen=True, slots=True)
class CategorySales:
    category_name: str
    quantity: int
    gross: int


@dataclass(frozen=True, slots=True)
class CashierSales:
    cashier_id: str
    order_count: int
    net: int


async def daily_category_sales(
    uow: SqlAlchemyUnitOfWork, outlet_id: str, day: date
) -> list[CategorySales]:
    rows = await uow.session.execute(
        select(
            OrderLineModel.category_name,
            func.sum(OrderLineModel.quantity),
            func.sum(OrderLineModel.line_total),
        )
        .join(OrderModel, OrderModel.id == OrderLineModel.order_id)
        .where(_day(outlet_id, day), OrderModel.status == "paid")
        .group_by(OrderLineModel.category_name)
    )
    return [CategorySales(name, int(qty), int(gross)) for name, qty, gross in rows]


async def daily_cashier_sales(
    uow: SqlAlchemyUnitOfWork, outlet_id: str, day: date
) -> list[CashierSales]:
    rows = await uow.session.execute(
        select(OrderModel.cashier_id, func.count(), func.sum(OrderModel.total))
        .where(_day(outlet_id, day), OrderModel.status == "paid")
        .group_by(OrderModel.cashier_id)
    )
    return [CashierSales(cid, int(n), int(net)) for cid, n, net in rows]


@dataclass(frozen=True, slots=True)
class ChannelSales:
    channel_id: str
    order_count: int
    gross: int
    net: int


async def daily_channel_sales(
    uow: SqlAlchemyUnitOfWork, outlet_id: str, day: date
) -> list[ChannelSales]:
    """Paid orders per sales channel (ADR-029); orders without one (none after 0026) are out."""
    rows = await uow.session.execute(
        select(
            OrderModel.channel_id,
            func.count(),
            func.sum(OrderModel.subtotal),
            func.sum(OrderModel.total),
        )
        .where(
            _day(outlet_id, day), OrderModel.status == "paid", OrderModel.channel_id.is_not(None)
        )
        .group_by(OrderModel.channel_id)
    )
    return [ChannelSales(str(c), int(n), int(g), int(t)) for c, n, g, t in rows]


async def order_detail(uow: SqlAlchemyUnitOfWork, order_id: str) -> dict[str, object] | None:
    """One order as JSON-ready data (for integrations, ADR-020); None if RLS hides it."""
    order = await uow.session.get(OrderModel, order_id)
    if order is None:
        return None
    lines = list(
        await uow.session.scalars(
            select(OrderLineModel)
            .where(OrderLineModel.order_id == order_id)
            .order_by(OrderLineModel.sort_order)
        )
    )
    modifiers = list(
        await uow.session.scalars(
            select(OrderLineModifierModel).where(
                OrderLineModifierModel.order_line_id.in_([line.id for line in lines])
            )
        )
    )
    payments = list(
        await uow.session.scalars(select(PaymentModel).where(PaymentModel.order_id == order_id))
    )
    void = await uow.session.get(OrderVoidModel, order_id)
    refunds = list(
        await uow.session.scalars(
            select(RefundModel)
            .where(RefundModel.order_id == order_id)
            .order_by(RefundModel.created_at)
        )
    )
    refunded = dict(
        (line_id, int(quantity))
        for line_id, quantity in await uow.session.execute(
            select(RefundLineModel.order_line_id, func.sum(RefundLineModel.quantity))
            .where(RefundLineModel.refund_id.in_([r.id for r in refunds]))
            .group_by(RefundLineModel.order_line_id)
        )
    )
    return {
        "id": order.id,
        "outlet_id": order.outlet_id,
        "device_id": order.device_id,
        "shift_id": order.shift_id,
        "receipt_no": order.receipt_no,
        "cashier_id": order.cashier_id,
        "business_date": order.business_date.isoformat(),
        "order_type": order.order_type,
        "table_label": order.table_label,
        "status": order.status,
        "subtotal": order.subtotal,
        "discount_amount": order.discount_amount,
        "price_includes_tax": order.price_includes_tax,
        "channel_id": order.channel_id,
        "external_ref": order.external_ref,
        "queue_no": order.queue_no,
        "customer_name": order.customer_name,
        "service_charge": order.service_charge,
        "tax": order.tax,
        "total": order.total,
        "paid_amount": order.paid_amount,
        "change_amount": order.change_amount,
        "flags": list(order.flags),
        "created_at": order.created_at.isoformat(),
        "lines": [
            {
                "id": line.id,
                "product_id": line.product_id,
                "product_name": line.product_name,
                "category_name": line.category_name,
                "unit_price": line.unit_price,
                "quantity": line.quantity,
                "line_total": line.line_total,
                "discount_amount": line.discount_amount,
                "promotion_id": line.promotion_id,
                "notes": line.notes,
                "refunded_quantity": refunded.get(line.id, 0),  # ADR-023
                "modifiers": [
                    {"modifier_option_id": m.modifier_option_id, "name": m.name, "price": m.price}
                    for m in modifiers
                    if m.order_line_id == line.id
                ],
            }
            for line in lines
        ],
        "payments": [
            {
                "id": p.id,
                "payment_method_id": p.payment_method_id,
                "method_type": p.method_type,
                "amount": p.amount,
                "reference": p.reference,
            }
            for p in payments
        ],
        "void": (
            {
                "reason": void.reason,
                "voided_by": void.voided_by,
                "approved_by": void.approved_by,
                "voided_at": void.voided_at.isoformat(),
            }
            if void
            else None
        ),
        "refunds": [
            {
                "id": r.id,
                "refund_no": r.refund_no,
                "business_date": r.business_date.isoformat(),
                "total": r.total,
                "flags": list(r.flags),
            }
            for r in refunds
        ],
    }


async def order_id_by_receipt(
    uow: SqlAlchemyUnitOfWork, outlet_id: str, receipt_no: str
) -> str | None:
    return await uow.session.scalar(
        select(OrderModel.id).where(
            OrderModel.outlet_id == outlet_id, OrderModel.receipt_no == receipt_no
        )
    )


def _refund_summary(r: RefundModel) -> dict[str, object]:
    return {
        "id": r.id,
        "order_id": r.order_id,
        "outlet_id": r.outlet_id,
        "device_id": r.device_id,
        "shift_id": r.shift_id,
        "refund_no": r.refund_no,
        "business_date": r.business_date.isoformat(),
        "reason": r.reason,
        "refunded_by": r.refunded_by,
        "approved_by": r.approved_by,
        "total": r.total,
        "flags": list(r.flags),
        "created_at": r.created_at.isoformat(),
    }


async def list_refunds(
    uow: SqlAlchemyUnitOfWork, outlet_id: str, day: date
) -> list[dict[str, object]]:
    rows = await uow.session.scalars(
        select(RefundModel).where(_refund_day(outlet_id, day)).order_by(RefundModel.created_at)
    )
    return [_refund_summary(r) for r in rows]


async def refund_detail(uow: SqlAlchemyUnitOfWork, refund_id: str) -> dict[str, object] | None:
    """One refund with its lines and payments (back-office, webhooks); None if RLS hides it."""
    refund = await uow.session.get(RefundModel, refund_id)
    if refund is None:
        return None
    lines = await uow.session.scalars(
        select(RefundLineModel)
        .where(RefundLineModel.refund_id == refund_id)
        .order_by(RefundLineModel.id)
    )
    payments = await uow.session.scalars(
        select(RefundPaymentModel).where(RefundPaymentModel.refund_id == refund_id)
    )
    return _refund_summary(refund) | {
        "lines": [
            {
                "order_line_id": x.order_line_id,
                "product_id": x.product_id,
                "product_name": x.product_name,
                "quantity": x.quantity,
                "amount": x.amount,
            }
            for x in lines
        ],
        "payments": [
            {
                "id": y.id,
                "payment_method_id": y.payment_method_id,
                "method_type": y.method_type,
                "method_name": y.method_name,
                "amount": y.amount,
                "reference": y.reference,
            }
            for y in payments
        ],
    }


async def list_bill_voids(
    uow: SqlAlchemyUnitOfWork, outlet_ids: list[str], start: date, end: date
) -> list[dict[str, object]]:
    """Pre-payment voids (ADR-028) of the given outlets and business days, newest first."""
    return await _bill_voids(
        uow,
        and_(
            BillVoidModel.outlet_id.in_(outlet_ids),
            BillVoidModel.business_date.between(start, end),
        ),
    )


async def bill_void_detail(uow: SqlAlchemyUnitOfWork, void_id: str) -> dict[str, object] | None:
    """One pre-payment void with its lines (webhooks); None if RLS hides it."""
    found = await _bill_voids(uow, BillVoidModel.id == void_id)
    return found[0] if found else None


async def _bill_voids(
    uow: SqlAlchemyUnitOfWork, where: ColumnElement[bool]
) -> list[dict[str, object]]:
    voids = list(
        await uow.session.scalars(
            select(BillVoidModel)
            .where(where)
            .order_by(BillVoidModel.voided_at.desc(), BillVoidModel.id.desc())
        )
    )
    lines: dict[str, list[dict[str, object]]] = defaultdict(list)
    if voids:
        rows = await uow.session.scalars(
            select(BillVoidLineModel)
            .where(BillVoidLineModel.void_id.in_([v.id for v in voids]))
            .order_by(BillVoidLineModel.void_id, BillVoidLineModel.sort_order)
        )
        for x in rows:
            lines[x.void_id].append(
                {
                    "product_id": x.product_id,
                    "product_name": x.product_name,
                    "modifiers": list(x.modifiers),
                    "unit_price": x.unit_price,
                    "quantity": x.quantity,
                    "amount": x.amount,
                }
            )
    return [
        {
            "id": v.id,
            "outlet_id": v.outlet_id,
            "device_id": v.device_id,
            "shift_id": v.shift_id,
            "business_date": v.business_date,
            "bill_id": v.bill_id,
            "scope": v.scope,
            "table_label": v.table_label,
            "cashier_id": v.cashier_id,
            "approved_by": v.approved_by,
            "reason": v.reason,
            "amount": v.amount,
            "voided_at": v.voided_at,
            "lines": lines[v.id],
        }
        for v in voids
    ]
