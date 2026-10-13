"""Public API of the sales module (other modules import only this)."""

from poslite.sales.application.correct_order import RefundOrderHandler, VoidOrderHandler
from poslite.sales.application.place_order import PlaceOrderHandler, SalesUnitOfWork
from poslite.sales.domain.corrections import (
    RefundLineData,
    RefundOrderData,
    RefundPaymentData,
    VoidOrderData,
)
from poslite.sales.domain.entities import LineModifier, OrderLine, Payment, PlaceOrderData
from poslite.sales.domain.repository import OrderRepository
from poslite.sales.domain.value_objects import Discount, PriceBreakdown, Rates
from poslite.sales.infrastructure.queries import (
    CashierSales,
    CategorySales,
    DailyTotals,
    OrderSummary,
    PaymentSales,
    ProductSales,
    daily_cashier_sales,
    daily_category_sales,
    daily_payment_sales,
    daily_product_sales,
    daily_totals,
    list_orders,
    list_refunds,
    order_detail,
    order_id_by_receipt,
    refund_detail,
)
from poslite.sales.infrastructure.repository import SqlAlchemyOrderRepository

__all__ = [
    "CashierSales",
    "CategorySales",
    "DailyTotals",
    "Discount",
    "LineModifier",
    "OrderLine",
    "OrderRepository",
    "OrderSummary",
    "Payment",
    "PaymentSales",
    "PlaceOrderData",
    "PlaceOrderHandler",
    "PriceBreakdown",
    "ProductSales",
    "Rates",
    "RefundLineData",
    "RefundOrderData",
    "RefundOrderHandler",
    "RefundPaymentData",
    "SalesUnitOfWork",
    "SqlAlchemyOrderRepository",
    "VoidOrderData",
    "VoidOrderHandler",
    "daily_cashier_sales",
    "daily_category_sales",
    "daily_payment_sales",
    "daily_product_sales",
    "daily_totals",
    "list_orders",
    "list_refunds",
    "order_detail",
    "order_id_by_receipt",
    "refund_detail",
]
