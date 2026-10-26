from dataclasses import dataclass, replace
from datetime import date, datetime

from sqlalchemy import select

from poslite.shared.domain.errors import DomainError
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork
from poslite.shift.infrastructure.models import CashMovementModel, ShiftModel


@dataclass(frozen=True, slots=True)
class DayShift:
    status: str
    opening_cash: int
    expected_cash: int | None
    counted_cash: int | None
    variance: int | None


async def shifts_of_day(
    uow: SqlAlchemyUnitOfWork, outlet_id: str, business_date: date
) -> list[DayShift]:
    """Every shift of one outlet and business day, for the day closing (ADR-026)."""
    rows = await uow.session.scalars(
        select(ShiftModel)
        .where(ShiftModel.outlet_id == outlet_id, ShiftModel.business_date == business_date)
        .order_by(ShiftModel.opened_at)
    )
    return [
        DayShift(r.status, r.opening_cash, r.expected_cash, r.counted_cash, r.variance)
        for r in rows
    ]


@dataclass(frozen=True, slots=True)
class ShiftRow:
    id: str
    outlet_id: str
    device_id: str
    business_date: date
    status: str
    opened_by: str
    opened_at: datetime
    opening_cash: int
    closed_by: str | None
    closed_at: datetime | None
    expected_cash: int | None
    counted_cash: int | None
    variance: int | None
    denominations: dict[str, int] | None = None  # filled for the detail only


@dataclass(frozen=True, slots=True)
class CashMovementRow:
    id: str
    type: str
    amount: int
    reason: str
    created_by: str
    created_at: datetime


def _row(r: ShiftModel) -> ShiftRow:
    return ShiftRow(
        r.id,
        r.outlet_id,
        r.device_id,
        r.business_date,
        r.status,
        r.opened_by,
        r.opened_at,
        r.opening_cash,
        r.closed_by,
        r.closed_at,
        r.expected_cash,
        r.counted_cash,
        r.variance,
    )


async def list_shifts(
    uow: SqlAlchemyUnitOfWork, outlet_id: str, business_date: date
) -> list[ShiftRow]:
    rows = await uow.session.scalars(
        select(ShiftModel)
        .where(ShiftModel.outlet_id == outlet_id, ShiftModel.business_date == business_date)
        .order_by(ShiftModel.opened_at)
    )
    return [_row(r) for r in rows]


async def shift_detail(
    uow: SqlAlchemyUnitOfWork, shift_id: str
) -> tuple[ShiftRow, list[CashMovementRow]]:
    row = await uow.session.get(ShiftModel, shift_id)
    if row is None:
        raise DomainError("SHIFT_NOT_FOUND", "Shift not found", kind="not_found")
    movements = await uow.session.scalars(
        select(CashMovementModel)
        .where(CashMovementModel.shift_id == shift_id)
        .order_by(CashMovementModel.created_at)
    )
    detail = replace(_row(row), denominations=row.denominations)
    return detail, [
        CashMovementRow(m.id, m.type, m.amount, m.reason, m.created_by, m.created_at)
        for m in movements
    ]
