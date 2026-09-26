from datetime import datetime

from sqlalchemy import CHAR, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from poslite.shared.infrastructure.database import Base


class PlatformAdminModel(Base):
    __tablename__ = "platform_admins"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    email: Mapped[str] = mapped_column(String(254))
    name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PlatformTokenModel(Base):
    __tablename__ = "platform_tokens"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    admin_id: Mapped[str] = mapped_column(CHAR(26))
    token_hash: Mapped[str] = mapped_column(CHAR(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
