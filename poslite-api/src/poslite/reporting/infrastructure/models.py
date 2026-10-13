from datetime import date, datetime

from sqlalchemy import CHAR, BigInteger, Date, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from poslite.shared.infrastructure.database import Base


class DailySalesModel(Base):
    __tablename__ = "rpt_daily_sales"

    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    outlet_id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    business_date: Mapped[date] = mapped_column(Date, primary_key=True)
    gross: Mapped[int] = mapped_column(BigInteger)
    discount: Mapped[int] = mapped_column(BigInteger)
    service: Mapped[int] = mapped_column(BigInteger)
    tax: Mapped[int] = mapped_column(BigInteger)
    net: Mapped[int] = mapped_column(BigInteger)
    order_count: Mapped[int] = mapped_column(Integer)
    void_count: Mapped[int] = mapped_column(Integer)
    refund_amount: Mapped[int] = mapped_column(BigInteger, server_default="0")
    refund_count: Mapped[int] = mapped_column(Integer, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DailyProductSalesModel(Base):
    __tablename__ = "rpt_daily_product_sales"

    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    outlet_id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    business_date: Mapped[date] = mapped_column(Date, primary_key=True)
    product_id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    product_name: Mapped[str] = mapped_column(String(150))
    quantity: Mapped[int] = mapped_column(Integer)
    gross: Mapped[int] = mapped_column(BigInteger)
    refund_qty: Mapped[int] = mapped_column(Integer, server_default="0")
    refund_amount: Mapped[int] = mapped_column(BigInteger, server_default="0")


class DailyPaymentSalesModel(Base):
    __tablename__ = "rpt_daily_payment_sales"

    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    outlet_id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    business_date: Mapped[date] = mapped_column(Date, primary_key=True)
    payment_method_id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    method_type: Mapped[str] = mapped_column(String(20))
    amount: Mapped[int] = mapped_column(BigInteger)
    count: Mapped[int] = mapped_column(Integer)
    refund_amount: Mapped[int] = mapped_column(BigInteger, server_default="0")


class DailyCategorySalesModel(Base):
    __tablename__ = "rpt_daily_category_sales"

    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    outlet_id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    business_date: Mapped[date] = mapped_column(Date, primary_key=True)
    category_name: Mapped[str] = mapped_column(String(100), primary_key=True)
    quantity: Mapped[int] = mapped_column(Integer)
    gross: Mapped[int] = mapped_column(BigInteger)


class DailyCashierSalesModel(Base):
    __tablename__ = "rpt_daily_cashier_sales"

    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    outlet_id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    business_date: Mapped[date] = mapped_column(Date, primary_key=True)
    cashier_id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    order_count: Mapped[int] = mapped_column(Integer)
    net: Mapped[int] = mapped_column(BigInteger)
