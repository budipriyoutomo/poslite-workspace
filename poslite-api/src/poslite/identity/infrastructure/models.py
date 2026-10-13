from datetime import datetime

from sqlalchemy import CHAR, Boolean, DateTime, Integer, SmallInteger, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from poslite.shared.infrastructure.columns import MasterColumns
from poslite.shared.infrastructure.database import Base


class UserModel(MasterColumns, Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(254))
    password_hash: Mapped[str | None] = mapped_column(Text)
    pin_hash: Mapped[str | None] = mapped_column(Text)
    pin_salt: Mapped[str | None] = mapped_column(Text)
    pin_iterations: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true")


class UserAssignmentModel(Base):
    """A user's role over the company, a brand or an outlet (ADR-022). Changing it must touch
    users.version (ADR-009 link tables)."""

    __tablename__ = "user_assignments"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    user_id: Mapped[str] = mapped_column(CHAR(26))
    role_id: Mapped[int] = mapped_column(SmallInteger)
    scope_type: Mapped[str] = mapped_column(String(10))
    brand_id: Mapped[str | None] = mapped_column(CHAR(26))
    outlet_id: Mapped[str | None] = mapped_column(CHAR(26))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ApiTokenModel(Base):
    __tablename__ = "api_tokens"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    owner_type: Mapped[str] = mapped_column(String(20))
    owner_id: Mapped[str] = mapped_column(CHAR(26))
    token_hash: Mapped[str] = mapped_column(CHAR(64), unique=True)
    abilities: Mapped[list[str]] = mapped_column(ARRAY(String(50)))
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
