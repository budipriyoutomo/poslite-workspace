from datetime import datetime

from sqlalchemy import CHAR, DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from poslite.shared.infrastructure.database import Base


class SyncEventModel(Base):
    __tablename__ = "sync_events"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    device_id: Mapped[str] = mapped_column(CHAR(26))
    type: Mapped[str] = mapped_column(String(30))
    aggregate_id: Mapped[str] = mapped_column(CHAR(26))
    status: Mapped[str] = mapped_column(String(10))
    error_code: Mapped[str | None] = mapped_column(String(50))
    flags: Mapped[list[str]] = mapped_column(ARRAY(String(30)))
    payload: Mapped[dict[str, object]] = mapped_column(JSONB)
    attempts: Mapped[int] = mapped_column(Integer, server_default="1")
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    processed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class DeviceImportModel(Base):
    __tablename__ = "device_imports"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    device_id: Mapped[str] = mapped_column(CHAR(26))
    imported_by: Mapped[str] = mapped_column(CHAR(26))
    file_sha256: Mapped[str] = mapped_column(CHAR(64))
    accepted: Mapped[int] = mapped_column(Integer)
    duplicate: Mapped[int] = mapped_column(Integer)
    flagged: Mapped[int] = mapped_column(Integer)
    rejected: Mapped[list[dict[str, str | None]]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
