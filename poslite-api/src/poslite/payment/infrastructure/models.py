from datetime import datetime

from sqlalchemy import CHAR, BigInteger, Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from poslite.shared.infrastructure.columns import MasterColumns
from poslite.shared.infrastructure.database import Base


class PaymentMethodModel(MasterColumns, Base):
    __tablename__ = "payment_methods"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    type: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(100))
    logo_url: Mapped[str | None] = mapped_column(Text)
    requires_reference: Mapped[bool] = mapped_column(Boolean, server_default="false")
    sort_order: Mapped[int] = mapped_column(Integer, server_default="0")


class QrisChargeModel(Base):
    __tablename__ = "qris_charges"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    outlet_id: Mapped[str] = mapped_column(CHAR(26))
    device_id: Mapped[str] = mapped_column(CHAR(26))
    amount: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(10), server_default="pending")
    gateway_ref: Mapped[str] = mapped_column(String(100))
    qr_string: Mapped[str] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OutletPaymentMethodModel(Base):
    """A payment method switched on at an outlet; changes touch payment_methods.version."""

    __tablename__ = "outlet_payment_method"

    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    outlet_id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    payment_method_id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
