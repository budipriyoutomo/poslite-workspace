from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status

from poslite.catalog.application.schemas import ChannelPricesIn, SalesChannelIn, SalesChannelOut
from poslite.catalog.infrastructure import channels as service
from poslite.identity import api as identity
from poslite.organization import api as organization
from poslite.payment import api as payment
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork
from poslite.shared.presentation.dependencies import id_factory, open_uow
from poslite.shared.presentation.envelope import ApiResponse, ok
from poslite.shared.presentation.security import Principal, require_ability

router = APIRouter(tags=["catalog"])
Reader = Annotated[Principal, Depends(require_ability("backoffice:read"))]
Writer = Annotated[Principal, Depends(require_ability("backoffice:write"))]

# Sales channels are brand master data like the menu (ADR-022, ADR-029).


async def _check(uow: SqlAlchemyUnitOfWork, brand_id: str, body: SalesChannelIn) -> None:
    await organization.get_brand(uow, brand_id)
    if body.default_payment_method_id is not None:
        await payment.ensure_payment_method(uow, body.default_payment_method_id)


@router.get("/sales-channels")
async def list_channels(
    request: Request, principal: Reader, brand: identity.ReadBrand
) -> ApiResponse[list[SalesChannelOut]]:
    async with open_uow(request, principal.tenant_id) as uow:
        return ok(await service.list_channels(uow, brand_id=brand))


@router.post("/sales-channels", status_code=status.HTTP_201_CREATED)
async def create_channel(
    body: SalesChannelIn,
    request: Request,
    principal: Writer,
    brand: identity.ManagedBrand,
    new_id: Annotated[Callable[[], str], Depends(id_factory)],
) -> ApiResponse[SalesChannelOut]:
    async with open_uow(request, principal.tenant_id) as uow:
        await _check(uow, brand, body)
        result = await service.create_channel(uow, new_id, body, brand_id=brand)
        await uow.commit()
    return ok(result)


@router.put("/sales-channels/{channel_id}")
async def update_channel(
    channel_id: str,
    body: SalesChannelIn,
    request: Request,
    principal: Writer,
    brand: identity.ManagedBrand,
) -> ApiResponse[SalesChannelOut]:
    async with open_uow(request, principal.tenant_id) as uow:
        await _check(uow, brand, body)
        result = await service.update_channel(uow, channel_id, body, brand_id=brand)
        await uow.commit()
    return ok(result)


@router.put("/sales-channels/{channel_id}/prices")
async def set_channel_prices(
    channel_id: str,
    body: ChannelPricesIn,
    request: Request,
    principal: Writer,
    brand: identity.ManagedBrand,
) -> ApiResponse[SalesChannelOut]:
    """The whole price list of a `price_list` channel; products left out are not sold there."""
    async with open_uow(request, principal.tenant_id) as uow:
        result = await service.set_channel_prices(uow, channel_id, body, brand_id=brand)
        await uow.commit()
    return ok(result)


@router.delete("/sales-channels/{channel_id}")
async def delete_channel(
    channel_id: str, request: Request, principal: Writer, brand: identity.ManagedBrand
) -> ApiResponse[None]:
    async with open_uow(request, principal.tenant_id) as uow:
        await service.delete_channel(uow, channel_id, brand_id=brand)
        await uow.commit()
    return ok(None)
