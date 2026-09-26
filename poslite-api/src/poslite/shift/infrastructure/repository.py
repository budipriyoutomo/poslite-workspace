from sqlalchemy.ext.asyncio import AsyncSession

from poslite.shift.domain.entities import CashMovement, Shift
from poslite.shift.infrastructure.models import CashMovementModel, ShiftModel

_FIELDS = ("status", "closed_by", "closed_at", "counted_cash", "expected_cash", "variance")


class SqlAlchemyShiftRepository:
    def __init__(self, session: AsyncSession, tenant_id: str) -> None:
        self._session, self._tenant_id = session, tenant_id

    async def get(self, shift_id: str) -> Shift | None:
        row = await self._session.get(ShiftModel, shift_id)
        if row is None:
            return None
        return Shift(
            id=row.id,
            outlet_id=row.outlet_id,
            device_id=row.device_id,
            opened_by=row.opened_by,
            opened_at=row.opened_at,
            opening_cash=row.opening_cash,
            business_date=row.business_date,
            status=row.status,
            closed_by=row.closed_by,
            closed_at=row.closed_at,
            counted_cash=row.counted_cash,
            expected_cash=row.expected_cash,
            variance=row.variance,
        )

    async def add(self, shift: Shift) -> None:
        self._session.add(
            ShiftModel(
                id=shift.id,
                tenant_id=self._tenant_id,
                outlet_id=shift.outlet_id,
                device_id=shift.device_id,
                opened_by=shift.opened_by,
                opened_at=shift.opened_at,
                opening_cash=shift.opening_cash,
                business_date=shift.business_date,
                status=shift.status,
            )
        )
        await self._session.flush()

    async def save(self, shift: Shift) -> None:
        row = await self._session.get_one(ShiftModel, shift.id)
        for name in _FIELDS:
            setattr(row, name, getattr(shift, name))
        await self._session.flush()

    async def add_movement(self, movement: CashMovement) -> None:
        self._session.add(
            CashMovementModel(
                id=movement.id,
                tenant_id=self._tenant_id,
                shift_id=movement.shift_id,
                type=movement.type,
                amount=movement.amount,
                reason=movement.reason,
                created_by=movement.created_by,
                created_at=movement.created_at,
            )
        )
        await self._session.flush()
