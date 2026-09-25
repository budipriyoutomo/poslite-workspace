from datetime import datetime

from sqlalchemy import CHAR, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from poslite.shared.infrastructure.database import Base


class TenantModel(Base):
    """Global table (no RLS): one SaaS customer."""

    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    slug: Mapped[str] = mapped_column(String(63), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), server_default="active")
    default_timezone: Mapped[str] = mapped_column(String(64), server_default="Asia/Jakarta")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
