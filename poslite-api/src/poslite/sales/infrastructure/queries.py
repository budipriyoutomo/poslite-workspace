from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import ColumnElement, and_, func, select

from poslite.sales.infrastructure.models import OrderLineModel, OrderModel, PaymentModel
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


@dataclass(frozen=True, slots=True)
class ProductSales:
    product_id: str
    product_name: str
    quantity: int
    gross: int


@dataclass(frozen=True, slots=True)
class PaymentSales:
    payment_method_id: str
    method_type: str
    amount: int
    count: int


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
    return DailyTotals(*(int(v) for v in row))


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
    return [ProductSales(pid, name, int(qty), int(gross)) for pid, name, qty, gross in rows]


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
    return [PaymentSales(m, t, amount, count) for (m, t), (amount, count) in totals.items()]


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
