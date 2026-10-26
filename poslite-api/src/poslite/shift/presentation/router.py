from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel

from poslite.identity import api as identity
from poslite.organization import api as organization
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork
from poslite.shared.presentation.dependencies import open_uow
from poslite.shared.presentation.envelope import ApiResponse, ok
from poslite.shared.presentation.schemas import Ulid
from poslite.shared.presentation.security import Principal, require_ability
from poslite.shift.infrastructure.queries import ShiftRow, list_shifts, shift_detail

router = APIRouter(tags=["shift"])
Reader = Annotated[Principal, Depends(require_ability("backoffice:read"))]


class ShiftOut(BaseModel):
    id: str
    device_id: str
    device_name: str
    business_date: date
    status: str
    opened_by: str
    opened_by_name: str
    opened_at: datetime
    opening_cash: int
    closed_by: str | None
    closed_by_name: str | None
    closed_at: datetime | None
    expected_cash: int | None
    counted_cash: int | None
    variance: int | None


class CashMovementOut(BaseModel):
    id: str
    type: str
    amount: int
    reason: str
    created_by: str
    created_by_name: str
    created_at: datetime


class ShiftDetailOut(ShiftOut):
    cash_movements: list[CashMovementOut]
    # Blind close count (15 · UX-02): note value -> pieces; "1" = coins in Rupiah. Null without one.
    denominations: dict[str, int] | None


async def _outlet_in_scope(
    uow: SqlAlchemyUnitOfWork, scope: identity.AccessScope, outlet_id: str, brand: str | None
) -> None:
    outlet = await organization.get_outlet(uow, outlet_id)
    identity.ensure_outlet(scope, outlet_id=outlet.id, brand_id=outlet.brand_id, active_brand=brand)


async def _shifts_out(
    uow: SqlAlchemyUnitOfWork, outlet_id: str, rows: list[ShiftRow], extra_users: list[str]
) -> tuple[list[ShiftOut], dict[str, str]]:
    devices = {d.id: d.name for d in await organization.list_devices(uow, outlet_id)}
    users = [u for r in rows for u in (r.opened_by, r.closed_by) if u] + extra_users
    names = await identity.user_names(uow, users)
    out = [
        ShiftOut(
            id=r.id,
            device_id=r.device_id,
            device_name=devices.get(r.device_id, "?"),
            business_date=r.business_date,
            status=r.status,
            opened_by=r.opened_by,
            opened_by_name=names.get(r.opened_by, "?"),
            opened_at=r.opened_at,
            opening_cash=r.opening_cash,
            closed_by=r.closed_by,
            closed_by_name=names.get(r.closed_by, "?") if r.closed_by else None,
            closed_at=r.closed_at,
            expected_cash=r.expected_cash,
            counted_cash=r.counted_cash,
            variance=r.variance,
        )
        for r in rows
    ]
    return out, names


@router.get("/shifts")
async def shifts(
    request: Request,
    principal: Reader,
    scope: identity.Access,
    outlet_id: Annotated[Ulid, Query()],
    business_date: Annotated[date, Query()],
    brand: identity.BrandHeader = None,
) -> ApiResponse[list[ShiftOut]]:
    """Shifts of one outlet and business day (back-office; devices only push)."""
    async with open_uow(request, principal.tenant_id) as uow:
        await _outlet_in_scope(uow, scope, outlet_id, brand)
        out, _ = await _shifts_out(
            uow, outlet_id, await list_shifts(uow, outlet_id, business_date), []
        )
    return ok(out)


@router.get("/shifts/{shift_id}")
async def shift(
    shift_id: Ulid,
    request: Request,
    principal: Reader,
    scope: identity.Access,
    brand: identity.BrandHeader = None,
) -> ApiResponse[ShiftDetailOut]:
    async with open_uow(request, principal.tenant_id) as uow:
        row, movements = await shift_detail(uow, shift_id)
        await _outlet_in_scope(uow, scope, row.outlet_id, brand)
        [out], names = await _shifts_out(
            uow, row.outlet_id, [row], [m.created_by for m in movements]
        )
    return ok(
        ShiftDetailOut(
            **out.model_dump(),
            denominations=row.denominations,
            cash_movements=[
                CashMovementOut(
                    id=m.id,
                    type=m.type,
                    amount=m.amount,
                    reason=m.reason,
                    created_by=m.created_by,
                    created_by_name=names.get(m.created_by, "?"),
                    created_at=m.created_at,
                )
                for m in movements
            ],
        )
    )
