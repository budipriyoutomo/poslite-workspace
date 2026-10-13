from datetime import datetime
from typing import Any

from sqlalchemy import CHAR, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from poslite.shared.infrastructure.database import Base


class PlatformAdminModel(Base):
    __tablename__ = "platform_admins"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    email: Mapped[str] = mapped_column(String(254))
    name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(Text)
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PlatformTokenModel(Base):
    __tablename__ = "platform_tokens"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    admin_id: Mapped[str] = mapped_column(CHAR(26))
    token_hash: Mapped[str] = mapped_column(CHAR(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PlatformAuditModel(Base):
    """Append-only record of what an operator did (never updated or deleted)."""

    __tablename__ = "platform_audit_log"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    admin_id: Mapped[str] = mapped_column(CHAR(26))
    action: Mapped[str] = mapped_column(String(40))
    tenant_id: Mapped[str | None] = mapped_column(CHAR(26))
    target_id: Mapped[str | None] = mapped_column(CHAR(26))
    detail: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
