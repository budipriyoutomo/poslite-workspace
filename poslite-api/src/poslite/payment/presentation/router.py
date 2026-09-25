from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status

from poslite.payment.application.schemas import PaymentMethodIn, PaymentMethodOut
from poslite.payment.infrastructure import service
from poslite.shared.presentation.dependencies import id_factory, open_uow
from poslite.shared.presentation.envelope import ApiResponse, ok
from poslite.shared.presentation.security import Principal, require_ability

router = APIRouter(tags=["payment"])
Reader = Annotated[Principal, Depends(require_ability("backoffice:read"))]
Writer = Annotated[Principal, Depends(require_ability("backoffice:write"))]


@router.get("/payment-methods")
async def list_payment_methods(
    request: Request, principal: Reader
) -> ApiResponse[list[PaymentMethodOut]]:
    async with open_uow(request, principal.tenant_id) as uow:
        return ok(await service.list_payment_methods(uow))


@router.post("/payment-methods", status_code=status.HTTP_201_CREATED)
async def create_payment_method(
    body: PaymentMethodIn,
    request: Request,
    principal: Writer,
    new_id: Annotated[Callable[[], str], Depends(id_factory)],
) -> ApiResponse[PaymentMethodOut]:
    async with open_uow(request, principal.tenant_id) as uow:
        result = await service.create_payment_method(uow, new_id, body)
        await uow.commit()
    return ok(result)


@router.put("/payment-methods/{method_id}")
async def update_payment_method(
    method_id: str, body: PaymentMethodIn, request: Request, principal: Writer
) -> ApiResponse[PaymentMethodOut]:
    async with open_uow(request, principal.tenant_id) as uow:
        result = await service.update_payment_method(uow, method_id, body)
        await uow.commit()
    return ok(result)


@router.delete("/payment-methods/{method_id}")
async def delete_payment_method(
    method_id: str, request: Request, principal: Writer
) -> ApiResponse[None]:
    async with open_uow(request, principal.tenant_id) as uow:
        await service.delete_payment_method(uow, method_id)
        await uow.commit()
    return ok(None)
