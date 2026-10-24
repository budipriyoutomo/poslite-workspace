from datetime import date, datetime

from sqlalchemy import CHAR, BigInteger, Boolean, Date, DateTime, Integer, String
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from poslite.shared.infrastructure.database import Base


class OrderModel(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    outlet_id: Mapped[str] = mapped_column(CHAR(26))
    device_id: Mapped[str] = mapped_column(CHAR(26))
    shift_id: Mapped[str] = mapped_column(CHAR(26))
    receipt_no: Mapped[str] = mapped_column(String(40))
    cashier_id: Mapped[str] = mapped_column(CHAR(26))
    business_date: Mapped[date] = mapped_column(Date)
    order_type: Mapped[str] = mapped_column(String(20))
    table_label: Mapped[str | None] = mapped_column(String(30))
    subtotal: Mapped[int] = mapped_column(BigInteger)
    discount_type: Mapped[str | None] = mapped_column(String(20))
    discount_value: Mapped[int | None] = mapped_column(BigInteger)
    discount_amount: Mapped[int] = mapped_column(BigInteger)
    service_rate_bps: Mapped[int] = mapped_column(Integer)
    tax_rate_bps: Mapped[int] = mapped_column(Integer)
    price_includes_tax: Mapped[bool] = mapped_column(Boolean, default=False)  # ADR-030
    channel_id: Mapped[str | None] = mapped_column(CHAR(26))  # ADR-029
    external_ref: Mapped[str | None] = mapped_column(String(50))
    queue_no: Mapped[str | None] = mapped_column(String(20))  # P1-1
    customer_name: Mapped[str | None] = mapped_column(String(40))
    service_charge: Mapped[int] = mapped_column(BigInteger)
    tax: Mapped[int] = mapped_column(BigInteger)
    total: Mapped[int] = mapped_column(BigInteger)
    paid_amount: Mapped[int] = mapped_column(BigInteger)
    change_amount: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(10))
    flags: Mapped[list[str]] = mapped_column(ARRAY(String(30)))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class OrderLineModel(Base):
    __tablename__ = "order_lines"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    order_id: Mapped[str] = mapped_column(CHAR(26))
    product_id: Mapped[str] = mapped_column(CHAR(26))
    product_name: Mapped[str] = mapped_column(String(150))
    category_name: Mapped[str] = mapped_column(String(100))
    unit_price: Mapped[int] = mapped_column(BigInteger)
    modifiers_total: Mapped[int] = mapped_column(BigInteger)
    quantity: Mapped[int] = mapped_column(Integer)
    line_total: Mapped[int] = mapped_column(BigInteger)
    notes: Mapped[str] = mapped_column(String(200))
    sort_order: Mapped[int] = mapped_column(Integer)
    discount_type: Mapped[str | None] = mapped_column(String(20))
    discount_value: Mapped[int | None] = mapped_column(BigInteger)
    discount_amount: Mapped[int] = mapped_column(BigInteger, default=0)
    promotion_id: Mapped[str | None] = mapped_column(CHAR(26))
    promotion_name: Mapped[str | None] = mapped_column(String(100))


class OrderLineModifierModel(Base):
    __tablename__ = "order_line_modifiers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    order_line_id: Mapped[str] = mapped_column(CHAR(26))
    modifier_option_id: Mapped[str] = mapped_column(CHAR(26))
    name: Mapped[str] = mapped_column(String(100))
    price: Mapped[int] = mapped_column(BigInteger)


class PaymentModel(Base):
    __tablename__ = "payments"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    order_id: Mapped[str] = mapped_column(CHAR(26))
    payment_method_id: Mapped[str] = mapped_column(CHAR(26))
    method_type: Mapped[str] = mapped_column(String(20))
    amount: Mapped[int] = mapped_column(BigInteger)
    reference: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class OrderVoidModel(Base):
    __tablename__ = "order_voids"

    order_id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    device_id: Mapped[str] = mapped_column(CHAR(26))
    reason: Mapped[str] = mapped_column(String(200))
    voided_by: Mapped[str] = mapped_column(CHAR(26))
    approved_by: Mapped[str | None] = mapped_column(CHAR(26))
    voided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RefundModel(Base):
    """brand_id is filled from the outlet by a trigger (ADR-022), so it is not mapped."""

    __tablename__ = "refunds"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    outlet_id: Mapped[str] = mapped_column(CHAR(26))
    device_id: Mapped[str] = mapped_column(CHAR(26))
    shift_id: Mapped[str] = mapped_column(CHAR(26))
    order_id: Mapped[str] = mapped_column(CHAR(26))
    refund_no: Mapped[str] = mapped_column(String(40))
    business_date: Mapped[date] = mapped_column(Date)
    reason: Mapped[str] = mapped_column(String(200))
    refunded_by: Mapped[str] = mapped_column(CHAR(26))
    approved_by: Mapped[str | None] = mapped_column(CHAR(26))
    total: Mapped[int] = mapped_column(BigInteger)
    flags: Mapped[list[str]] = mapped_column(ARRAY(String(30)))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RefundLineModel(Base):
    __tablename__ = "refund_lines"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    refund_id: Mapped[str] = mapped_column(CHAR(26))
    order_line_id: Mapped[str] = mapped_column(CHAR(26))
    product_id: Mapped[str] = mapped_column(CHAR(26))
    product_name: Mapped[str] = mapped_column(String(150))
    quantity: Mapped[int] = mapped_column(Integer)
    amount: Mapped[int] = mapped_column(BigInteger)


class RefundPaymentModel(Base):
    __tablename__ = "refund_payments"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    refund_id: Mapped[str] = mapped_column(CHAR(26))
    payment_method_id: Mapped[str] = mapped_column(CHAR(26))
    method_type: Mapped[str] = mapped_column(String(20))
    method_name: Mapped[str] = mapped_column(String(100))
    amount: Mapped[int] = mapped_column(BigInteger)
    reference: Mapped[str | None] = mapped_column(String(64))


class BillVoidModel(Base):
    """Items cancelled from an open bill after the kitchen had them (ADR-028)."""

    __tablename__ = "bill_voids"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    outlet_id: Mapped[str] = mapped_column(CHAR(26))
    device_id: Mapped[str] = mapped_column(CHAR(26))
    shift_id: Mapped[str] = mapped_column(CHAR(26))
    business_date: Mapped[date] = mapped_column(Date)
    bill_id: Mapped[str] = mapped_column(CHAR(26))
    scope: Mapped[str] = mapped_column(String(20))
    table_label: Mapped[str] = mapped_column(String(30))
    cashier_id: Mapped[str] = mapped_column(CHAR(26))
    approved_by: Mapped[str | None] = mapped_column(CHAR(26))
    reason: Mapped[str] = mapped_column(String(200))
    amount: Mapped[int] = mapped_column(BigInteger)
    voided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class BillVoidLineModel(Base):
    __tablename__ = "bill_void_lines"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    void_id: Mapped[str] = mapped_column(CHAR(26))
    product_id: Mapped[str] = mapped_column(CHAR(26))
    product_name: Mapped[str] = mapped_column(String(150))
    modifiers: Mapped[list[str]] = mapped_column(ARRAY(String(100)))
    unit_price: Mapped[int] = mapped_column(BigInteger)
    quantity: Mapped[int] = mapped_column(Integer)
    amount: Mapped[int] = mapped_column(BigInteger)
    sort_order: Mapped[int] = mapped_column(Integer)


class OpenBillModel(Base):
    """An unpaid bill of a table-service outlet (ADR-031); lines are the device's cart lines."""

    __tablename__ = "open_bills"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    outlet_id: Mapped[str] = mapped_column(CHAR(26))
    table_id: Mapped[str | None] = mapped_column(CHAR(26))
    table_label: Mapped[str] = mapped_column(String(30))
    lines: Mapped[list[dict[str, object]]] = mapped_column(JSONB)
    discount: Mapped[dict[str, object] | None] = mapped_column(JSONB)
    opened_by: Mapped[str] = mapped_column(CHAR(26))
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer)
    lease_device_id: Mapped[str | None] = mapped_column(CHAR(26))
    lease_user_id: Mapped[str | None] = mapped_column(CHAR(26))
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_by_order_id: Mapped[str | None] = mapped_column(CHAR(26))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
