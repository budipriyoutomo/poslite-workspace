from datetime import datetime, time

from sqlalchemy import CHAR, DateTime, Integer, String, Text, Time, func
from sqlalchemy.orm import Mapped, mapped_column

from poslite.shared.infrastructure.columns import MasterColumns
from poslite.shared.infrastructure.database import Base


class OutletModel(MasterColumns, Base):
    __tablename__ = "outlets"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    code: Mapped[str] = mapped_column(String(10))
    name: Mapped[str] = mapped_column(String(100))
    address: Mapped[str] = mapped_column(Text, server_default="")
    phone: Mapped[str] = mapped_column(String(30), server_default="")
    timezone: Mapped[str] = mapped_column(String(64), server_default="Asia/Jakarta")
    business_day_cutoff: Mapped[time] = mapped_column(Time, server_default="04:00")
    tax_rate_bps: Mapped[int] = mapped_column(Integer, server_default="1000")
    service_rate_bps: Mapped[int] = mapped_column(Integer, server_default="0")
    receipt_header: Mapped[str] = mapped_column(Text, server_default="")
    receipt_footer: Mapped[str] = mapped_column(Text, server_default="")


class DeviceModel(Base):
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    outlet_id: Mapped[str] = mapped_column(CHAR(26))
    code: Mapped[str] = mapped_column(String(3))
    name: Mapped[str] = mapped_column(String(100))
    platform: Mapped[str] = mapped_column(String(30), server_default="")
    app_version: Mapped[str | None] = mapped_column(String(30))
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    activated_by: Mapped[str] = mapped_column(CHAR(26))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
