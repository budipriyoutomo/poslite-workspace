from datetime import date, datetime

from sqlalchemy import CHAR, BigInteger, Date, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from poslite.shared.infrastructure.database import Base


class SubscriptionModel(Base):
    __tablename__ = "subscriptions"

    tenant_id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    status: Mapped[str] = mapped_column(String(20))
    trial_ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    current_period_end: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class InvoiceModel(Base):
    __tablename__ = "invoices"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    outlet_count: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[int] = mapped_column(BigInteger)
    amount: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(10), server_default="open")
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    gateway_ref: Mapped[str | None] = mapped_column(String(100))
    payment_url: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
