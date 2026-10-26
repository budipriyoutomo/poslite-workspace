from datetime import datetime, time

from sqlalchemy import (
    CHAR,
    BigInteger,
    Boolean,
    DateTime,
    Integer,
    SmallInteger,
    String,
    Text,
    Time,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from poslite.shared.infrastructure.columns import MasterColumns
from poslite.shared.infrastructure.database import Base


class BrandModel(MasterColumns, Base):
    """ADR-022: a company's selling identity — its own menu and promotions, one or more outlets."""

    __tablename__ = "brands"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    code: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(100))
    logo_key: Mapped[str | None] = mapped_column(Text)
    receipt_header: Mapped[str] = mapped_column(Text, server_default="")
    receipt_footer: Mapped[str] = mapped_column(Text, server_default="")
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true")
    # Discount policy (06 Order rule 5), see organization.domain.discount_policy.
    discount_percentages: Mapped[list[int]] = mapped_column(
        ARRAY(SmallInteger), server_default="{5,10,15,20}"
    )
    discount_amounts: Mapped[list[int]] = mapped_column(
        ARRAY(BigInteger), server_default="{5000,10000,25000,50000}"
    )
    allow_custom_discount: Mapped[bool] = mapped_column(Boolean, server_default="true")
    cashier_max_discount_percentage: Mapped[int] = mapped_column(SmallInteger, server_default="20")
    cashier_max_discount_amount: Mapped[int] = mapped_column(BigInteger, server_default="50000")
    # Menu prices already include service and PB1 (ADR-030).
    price_includes_tax: Mapped[bool] = mapped_column(Boolean, server_default="false")
    # Cashiers count the drawer without seeing the expected amount (15 · UX-02).
    blind_close: Mapped[bool] = mapped_column(Boolean, server_default="true")


class OutletModel(MasterColumns, Base):
    __tablename__ = "outlets"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    brand_id: Mapped[str] = mapped_column(CHAR(26))  # fixed for life: orders keep it (ADR-022)
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
    service_mode: Mapped[str] = mapped_column(String(20), server_default="counter")  # ADR-031
    cash_rounding_unit: Mapped[int] = mapped_column(Integer, server_default="0")  # P1-3
    cash_rounding_mode: Mapped[str] = mapped_column(String(10), server_default="nearest")


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


class DiningTableModel(MasterColumns, Base):
    __tablename__ = "dining_tables"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    outlet_id: Mapped[str] = mapped_column(CHAR(26))
    label: Mapped[str] = mapped_column(String(30))
    area: Mapped[str] = mapped_column(String(50), server_default="")
    seats: Mapped[int] = mapped_column(Integer, server_default="0")
    sort_order: Mapped[int] = mapped_column(Integer, server_default="0")
