from dataclasses import dataclass
from datetime import date

from sqlalchemy import select

from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork
from poslite.shift.infrastructure.models import ShiftModel


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
