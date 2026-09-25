from datetime import datetime

from sqlalchemy import CHAR, DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from poslite.shared.infrastructure.database import Base


class OutboxMessageModel(Base):
    """Transactional outbox (ADR-012): written in the same transaction as the data it describes."""

    __tablename__ = "outbox_messages"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26), nullable=False)
    topic: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, server_default="0")
    last_error: Mapped[str | None] = mapped_column(Text)
