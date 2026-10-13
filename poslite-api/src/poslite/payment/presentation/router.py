from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status

from poslite.identity import api as identity
from poslite.organization import api as organization
from poslite.payment.application.schemas import (
    MethodOutletsIn,
    NewPaymentMethodIn,
    PaymentMethodIn,
    PaymentMethodOut,
    QrisChargeIn,
    QrisChargeOut,
)
from poslite.payment.infrastructure import qris, service
from poslite.shared.application.clock import Clock
from poslite.shared.application.payment_gateway import PaymentGateway
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork
from poslite.shared.presentation.dependencies import clock, id_factory, open_uow, payment_gateway
from poslite.shared.presentation.envelope import ApiResponse, ok
from poslite.shared.presentation.security import Principal, require_ability

router = APIRouter(tags=["payment"])
Reader = Annotated[Principal, Depends(require_ability("backoffice:read"))]
Writer = Annotated[Principal, Depends(require_ability("backoffice:write"))]


@router.get("/payment-methods", dependencies=[identity.company_only])
async def list_payment_methods(
    request: Request, principal: Reader
) -> ApiResponse[list[PaymentMethodOut]]:
    async with open_uow(request, principal.tenant_id) as uow:
        return ok(await service.list_payment_methods(uow))


@router.post(
    "/payment-methods",
    status_code=status.HTTP_201_CREATED,
    dependencies=[identity.company_only],
)
async def create_payment_method(
    body: NewPaymentMethodIn,
    request: Request,
    principal: Writer,
    new_id: Annotated[Callable[[], str], Depends(id_factory)],
) -> ApiResponse[PaymentMethodOut]:
    async with open_uow(request, principal.tenant_id) as uow:
        outlet_ids = await _outlets(uow, body.outlet_ids)
        result = await service.create_payment_method(
            uow,
            new_id,
            PaymentMethodIn.model_validate(body.model_dump(exclude={"outlet_ids"})),
            outlet_ids=outlet_ids,
        )
        await uow.commit()
    return ok(result)


@router.put("/payment-methods/{method_id}", dependencies=[identity.company_only])
async def update_payment_method(
    method_id: str, body: PaymentMethodIn, request: Request, principal: Writer
) -> ApiResponse[PaymentMethodOut]:
    async with open_uow(request, principal.tenant_id) as uow:
        result = await service.update_payment_method(uow, method_id, body)
        await uow.commit()
    return ok(result)


@router.delete("/payment-methods/{method_id}", dependencies=[identity.company_only])
async def delete_payment_method(
    method_id: str, request: Request, principal: Writer
) -> ApiResponse[None]:
    async with open_uow(request, principal.tenant_id) as uow:
        await service.delete_payment_method(uow, method_id)
        await uow.commit()
    return ok(None)


async def _outlets(uow: SqlAlchemyUnitOfWork, outlet_ids: list[str] | None) -> list[str]:
    """The given outlets (each must exist), or every outlet of the company when None."""
    if outlet_ids is None:
        return [o.id for o in await organization.list_outlets(uow)]
    return [(await organization.get_outlet(uow, o)).id for o in outlet_ids]


@router.put("/payment-methods/{method_id}/outlets", dependencies=[identity.company_only])
async def set_payment_method_outlets(
    method_id: str, body: MethodOutletsIn, request: Request, principal: Writer
) -> ApiResponse[PaymentMethodOut]:
    """Where the method is taken (doc 11 §3); devices of other outlets drop it on their pull."""
    async with open_uow(request, principal.tenant_id) as uow:
        result = await service.set_method_outlets(
            uow, method_id, await _outlets(uow, body.outlet_ids)
        )
        await uow.commit()
    return ok(result)


Device = Annotated[Principal, Depends(require_ability("device:sync"))]


@router.post("/payments/qris", status_code=status.HTTP_201_CREATED)
async def create_qris(
    body: QrisChargeIn,
    request: Request,
    principal: Device,
    gateway: Annotated[PaymentGateway, Depends(payment_gateway)],
    now: Annotated[Clock, Depends(clock)],
) -> ApiResponse[QrisChargeOut]:
    """Online only: a dynamic QR for the bill; offline the device keeps static QRIS (ADR-019)."""
    async with open_uow(request, principal.tenant_id) as uow:
        device = await organization.get_device(uow, principal.owner_id)
        result = await qris.create_qris_charge(
            uow, gateway, body, outlet_id=device.outlet.id, device_id=device.id, now=now.now()
        )
        await uow.commit()
    return ok(result)


@router.get("/payments/qris/{charge_id}")
async def qris_status(
    charge_id: str,
    request: Request,
    principal: Device,
    now: Annotated[Clock, Depends(clock)],
) -> ApiResponse[QrisChargeOut]:
    """Polled by the device until the charge is paid or expired."""
    async with open_uow(request, principal.tenant_id) as uow:
        return ok(await qris.get_qris_charge(uow, charge_id, now=now.now()))
