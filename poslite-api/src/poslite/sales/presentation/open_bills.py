from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status
from pydantic import BaseModel, Field, JsonValue, StringConstraints

from poslite.identity import api as identity
from poslite.organization import api as organization
from poslite.sales.infrastructure import open_bills as service
from poslite.sales.infrastructure.open_bills import BillDraft, OpenBill
from poslite.shared.application.clock import Clock
from poslite.shared.domain.errors import DomainError
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork
from poslite.shared.presentation.dependencies import clock, open_uow
from poslite.shared.presentation.envelope import ApiResponse, ok
from poslite.shared.presentation.schemas import Ulid
from poslite.shared.presentation.security import Principal, require_ability

router = APIRouter(tags=["sales"])
Device = Annotated[Principal, Depends(require_ability("device:sync"))]
Now = Annotated[Clock, Depends(clock)]

# ADR-031: the open bills of a table-service outlet, shared by its devices. Lines are the
# device's cart lines (camelCase, as in its local database); the server only stores them.

Line = dict[str, JsonValue]


class BillDraftIn(BaseModel):
    table_id: Ulid | None = None
    table_label: Annotated[str, StringConstraints(min_length=1, max_length=30)]
    lines: Annotated[list[Line], Field(min_length=1, max_length=200)]
    discount: dict[str, JsonValue] | None = None
    user_id: Ulid  # who is working on the device
    # The bill left the device's screen with this save: another device may take it at once.
    release_lease: bool = False


class NewBillIn(BillDraftIn):
    id: Ulid
    opened_by: Ulid
    opened_at: datetime


class SaveBillIn(BillDraftIn):
    version: Annotated[int, Field(ge=1)]


class LeaseIn(BaseModel):
    user_id: Ulid


class LeaseOut(BaseModel):
    device_id: str
    device_name: str
    user_id: str
    until: datetime


class OpenBillOut(BaseModel):
    id: str
    table_id: str | None
    table_label: str
    lines: list[Line]
    discount: dict[str, JsonValue] | None
    opened_by: str
    opened_at: datetime
    version: int
    lease: LeaseOut | None = Field(description="null when nobody is editing the bill")
    updated_at: datetime


async def _out(
    uow: SqlAlchemyUnitOfWork, outlet_id: str, bills: list[OpenBill], now: datetime
) -> list[OpenBillOut]:
    names = {d.id: d.name for d in await organization.list_devices(uow, outlet_id)}
    return [
        OpenBillOut(
            id=b.id,
            table_id=b.table_id,
            table_label=b.table_label,
            lines=b.lines,
            discount=b.discount,
            opened_by=b.opened_by,
            opened_at=b.opened_at,
            version=b.version,
            lease=(
                LeaseOut(
                    device_id=b.lease.device_id,
                    device_name=names.get(b.lease.device_id, ""),
                    user_id=b.lease.user_id,
                    until=b.lease.until,
                )
                if b.lease is not None and b.lease.until > now
                else None
            ),
            updated_at=b.updated_at,
        )
        for b in bills
    ]


async def _device(uow: SqlAlchemyUnitOfWork, principal: Principal) -> organization.DeviceInfo:
    """The calling device; its outlet must share bills through the server."""
    device = await organization.get_device(uow, principal.owner_id)
    settings = await organization.get_outlet_settings(uow, device.outlet.id)
    if settings.service_mode != "table_service":
        raise DomainError(
            "NOT_TABLE_SERVICE", "This outlet keeps open bills on each device", kind="conflict"
        )
    return device


async def _draft(
    uow: SqlAlchemyUnitOfWork, device: organization.DeviceInfo, body: BillDraftIn
) -> BillDraft:
    outlet = device.outlet
    if not await identity.can_work(
        uow, user_id=body.user_id, outlet_id=outlet.id, brand_id=outlet.brand_id
    ):
        raise DomainError(
            "CASHIER_NOT_IN_OUTLET", "User does not work at this outlet", kind="forbidden"
        )
    if body.table_id is not None and (
        await organization.table_outlet_id(uow, body.table_id) != outlet.id
    ):
        raise DomainError("TABLE_NOT_FOUND", "Table not found", kind="not_found")
    return BillDraft(
        table_id=body.table_id,
        table_label=body.table_label,
        lines=body.lines,
        discount=body.discount,
    )


@router.get("/open-bills")
async def list_open_bills(
    request: Request, principal: Device, now: Now
) -> ApiResponse[list[OpenBillOut]]:
    """The outlet's open bills; devices poll this every few seconds while online."""
    async with open_uow(request, principal.tenant_id) as uow:
        device = await _device(uow, principal)
        bills = await service.list_open_bills(uow, outlet_id=device.outlet.id)
        return ok(await _out(uow, device.outlet.id, bills, now.now()))


@router.post("/open-bills", status_code=status.HTTP_201_CREATED)
async def open_bill(
    body: NewBillIn, request: Request, principal: Device, now: Now
) -> ApiResponse[OpenBillOut]:
    async with open_uow(request, principal.tenant_id) as uow:
        device = await _device(uow, principal)
        if not await identity.can_work(
            uow, user_id=body.opened_by, outlet_id=device.outlet.id, brand_id=device.outlet.brand_id
        ):
            raise DomainError(
                "CASHIER_NOT_IN_OUTLET", "User does not work at this outlet", kind="forbidden"
            )
        bill = await service.open_bill(
            uow,
            bill_id=body.id,
            outlet_id=device.outlet.id,
            draft=await _draft(uow, device, body),
            opened_by=body.opened_by,
            opened_at=body.opened_at,
            device_id=device.id,
            user_id=body.user_id,
            now=now.now(),
            release=body.release_lease,
        )
        [result] = await _out(uow, device.outlet.id, [bill], now.now())
        await uow.commit()
    return ok(result)


@router.post("/open-bills/{bill_id}/lease")
async def lease_bill(
    bill_id: str, body: LeaseIn, request: Request, principal: Device, now: Now
) -> ApiResponse[OpenBillOut]:
    """Takes the bill for editing, or renews the lease while it stays on screen."""
    async with open_uow(request, principal.tenant_id) as uow:
        device = await _device(uow, principal)
        bill = await service.lease_bill(
            uow,
            bill_id,
            outlet_id=device.outlet.id,
            device_id=device.id,
            user_id=body.user_id,
            now=now.now(),
        )
        [result] = await _out(uow, device.outlet.id, [bill], now.now())
        await uow.commit()
    return ok(result)


@router.delete("/open-bills/{bill_id}/lease")
async def release_lease(bill_id: str, request: Request, principal: Device) -> ApiResponse[None]:
    async with open_uow(request, principal.tenant_id) as uow:
        device = await _device(uow, principal)
        await service.release_lease(uow, bill_id, outlet_id=device.outlet.id, device_id=device.id)
        await uow.commit()
    return ok(None)


@router.put("/open-bills/{bill_id}")
async def save_bill(
    bill_id: str, body: SaveBillIn, request: Request, principal: Device, now: Now
) -> ApiResponse[OpenBillOut]:
    """Saves over `version`; an older version is 409 BILL_VERSION_CONFLICT (never merged)."""
    async with open_uow(request, principal.tenant_id) as uow:
        device = await _device(uow, principal)
        bill = await service.save_bill(
            uow,
            bill_id,
            outlet_id=device.outlet.id,
            version=body.version,
            draft=await _draft(uow, device, body),
            device_id=device.id,
            user_id=body.user_id,
            now=now.now(),
            release=body.release_lease,
        )
        [result] = await _out(uow, device.outlet.id, [bill], now.now())
        await uow.commit()
    return ok(result)


@router.delete("/open-bills/{bill_id}")
async def cancel_bill(
    bill_id: str,
    request: Request,
    principal: Device,
    now: Now,
    version: Annotated[int, Query(ge=1)],
) -> ApiResponse[None]:
    async with open_uow(request, principal.tenant_id) as uow:
        device = await _device(uow, principal)
        await service.cancel_bill(
            uow,
            bill_id,
            outlet_id=device.outlet.id,
            version=version,
            device_id=device.id,
            now=now.now(),
        )
        await uow.commit()
    return ok(None)
