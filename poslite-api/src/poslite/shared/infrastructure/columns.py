from datetime import datetime

from sqlalchemy import CHAR, BigInteger, DateTime, FetchedValue, func
from sqlalchemy.orm import Mapped, mapped_column


def ulid_pk() -> Mapped[str]:
    return mapped_column(CHAR(26), primary_key=True)


def tenant_fk() -> Mapped[str]:
    return mapped_column(CHAR(26), nullable=False)


class MasterColumns:
    """Master data: `version` set only by the DB trigger (ADR-009); soft delete via deleted_at."""

    version: Mapped[int] = mapped_column(
        BigInteger, server_default=FetchedValue(), server_onupdate=FetchedValue()
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
