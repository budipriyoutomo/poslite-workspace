from datetime import date, datetime

from sqlalchemy import CHAR, BigInteger, Date, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from poslite.shared.infrastructure.database import Base


class ShiftModel(Base):
    __tablename__ = "shifts"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    outlet_id: Mapped[str] = mapped_column(CHAR(26))
    device_id: Mapped[str] = mapped_column(CHAR(26))
    opened_by: Mapped[str] = mapped_column(CHAR(26))
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    opening_cash: Mapped[int] = mapped_column(BigInteger)
    business_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(10))
    closed_by: Mapped[str | None] = mapped_column(CHAR(26))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    counted_cash: Mapped[int | None] = mapped_column(BigInteger)
    expected_cash: Mapped[int | None] = mapped_column(BigInteger)
    variance: Mapped[int | None] = mapped_column(BigInteger)


class CashMovementModel(Base):
    __tablename__ = "cash_movements"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    shift_id: Mapped[str] = mapped_column(CHAR(26))
    type: Mapped[str] = mapped_column(String(3))
    amount: Mapped[int] = mapped_column(BigInteger)
    reason: Mapped[str] = mapped_column(String(200))
    created_by: Mapped[str] = mapped_column(CHAR(26))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
