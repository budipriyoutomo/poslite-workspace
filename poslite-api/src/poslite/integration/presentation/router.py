from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status

from poslite.identity import api as identity
from poslite.integration.application.schemas import (
    CreatedEndpointOut,
    DeliveryOut,
    EndpointIn,
    EndpointOut,
)
from poslite.integration.infrastructure import service
from poslite.organization import api as organization
from poslite.shared.presentation.dependencies import id_factory, open_uow
from poslite.shared.presentation.envelope import ApiResponse, ok
from poslite.shared.presentation.security import Principal, require_ability

router = APIRouter(
    tags=["integration"], dependencies=[identity.company_only]
)  # company page (ADR-022)
Reader = Annotated[Principal, Depends(require_ability("backoffice:read"))]
Writer = Annotated[Principal, Depends(require_ability("backoffice:write"))]


@router.get("/webhooks")
async def list_webhooks(request: Request, principal: Reader) -> ApiResponse[list[EndpointOut]]:
    async with open_uow(request, principal.tenant_id) as uow:
        return ok(await service.list_endpoints(uow))


@router.post("/webhooks", status_code=status.HTTP_201_CREATED)
async def create_webhook(
    body: EndpointIn,
    request: Request,
    principal: Writer,
    new_id: Annotated[Callable[[], str], Depends(id_factory)],
) -> ApiResponse[CreatedEndpointOut]:
    """The signing secret is returned only here (ADR-020)."""
    async with open_uow(request, principal.tenant_id) as uow:
        for brand_id in body.brand_ids:
            await organization.get_brand(uow, brand_id)
        created = await service.create_endpoint(uow, new_id, body)
        await uow.commit()
    return ok(created)


@router.delete("/webhooks/{endpoint_id}")
async def delete_webhook(
    endpoint_id: str, request: Request, principal: Writer
) -> ApiResponse[None]:
    async with open_uow(request, principal.tenant_id) as uow:
        await service.delete_endpoint(uow, endpoint_id)
        await uow.commit()
    return ok(None)


@router.get("/webhooks/{endpoint_id}/deliveries")
async def webhook_deliveries(
    endpoint_id: str, request: Request, principal: Reader
) -> ApiResponse[list[DeliveryOut]]:
    async with open_uow(request, principal.tenant_id) as uow:
        return ok(await service.list_deliveries(uow, endpoint_id))


@router.post("/webhook-deliveries/{delivery_id}/retry")
async def retry_webhook_delivery(
    delivery_id: str, request: Request, principal: Writer
) -> ApiResponse[None]:
    async with open_uow(request, principal.tenant_id) as uow:
        await service.retry_delivery(uow, delivery_id)
        await uow.commit()
    return ok(None)
