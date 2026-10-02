from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status

from poslite.catalog.application.images import upload_product_image
from poslite.catalog.application.schemas import (
    CategoryIn,
    CategoryOut,
    ImageOut,
    ModifierGroupIn,
    ModifierGroupOut,
    OutletProductIn,
    OutletProductOut,
    ProductIn,
    ProductOut,
)
from poslite.catalog.infrastructure import service
from poslite.organization import api as organization
from poslite.shared.application.object_storage import ObjectStorage
from poslite.shared.domain.media import MAX_IMAGE_BYTES
from poslite.shared.presentation.dependencies import (
    id_factory,
    media_base_url,
    object_storage,
    open_uow,
)
from poslite.shared.presentation.envelope import ApiResponse, ok
from poslite.shared.presentation.security import Principal, require_ability

router = APIRouter(tags=["catalog"])
Reader = Annotated[Principal, Depends(require_ability("backoffice:read"))]
Writer = Annotated[Principal, Depends(require_ability("backoffice:write"))]
NewId = Annotated[Callable[[], str], Depends(id_factory)]
MediaBase = Annotated[str, Depends(media_base_url)]


@router.get("/categories")
async def list_categories(request: Request, principal: Reader) -> ApiResponse[list[CategoryOut]]:
    async with open_uow(request, principal.tenant_id) as uow:
        return ok(await service.list_categories(uow))


@router.post("/categories", status_code=status.HTTP_201_CREATED)
async def create_category(
    body: CategoryIn, request: Request, principal: Writer, new_id: NewId
) -> ApiResponse[CategoryOut]:
    async with open_uow(request, principal.tenant_id) as uow:
        result = await service.create_category(uow, new_id, body)
        await uow.commit()
    return ok(result)


@router.put("/categories/{category_id}")
async def update_category(
    category_id: str, body: CategoryIn, request: Request, principal: Writer
) -> ApiResponse[CategoryOut]:
    async with open_uow(request, principal.tenant_id) as uow:
        result = await service.update_category(uow, category_id, body)
        await uow.commit()
    return ok(result)


@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: str, request: Request, principal: Writer
) -> ApiResponse[None]:
    async with open_uow(request, principal.tenant_id) as uow:
        await service.delete_category(uow, category_id)
        await uow.commit()
    return ok(None)


async def _read_body(request: Request, limit: int) -> bytes:
    """The raw body, cut off one byte past the limit so an oversized upload is not buffered."""
    data = bytearray()
    async for chunk in request.stream():
        data += chunk
        if len(data) > limit:
            break
    return bytes(data)


@router.post(
    "/media/images",
    status_code=status.HTTP_201_CREATED,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                t: {"schema": {"type": "string", "format": "binary"}}
                for t in ("image/jpeg", "image/png", "image/webp")
            },
        }
    },
)
async def upload_image(
    request: Request,
    principal: Writer,
    new_id: NewId,
    storage: Annotated[ObjectStorage, Depends(object_storage)],
    base_url: MediaBase,
) -> ApiResponse[ImageOut]:
    """Product image as the raw request body (JPEG/PNG/WebP, max 2 MB, ADR-021)."""
    data = await _read_body(request, MAX_IMAGE_BYTES)
    return ok(
        await upload_product_image(
            storage, data, tenant_id=principal.tenant_id, new_id=new_id, base_url=base_url
        )
    )


@router.get("/products")
async def list_products(
    request: Request, principal: Reader, base_url: MediaBase
) -> ApiResponse[list[ProductOut]]:
    async with open_uow(request, principal.tenant_id) as uow:
        return ok(await service.list_products(uow, base_url))


@router.post("/products", status_code=status.HTTP_201_CREATED)
async def create_product(
    body: ProductIn, request: Request, principal: Writer, new_id: NewId, base_url: MediaBase
) -> ApiResponse[ProductOut]:
    async with open_uow(request, principal.tenant_id) as uow:
        result = await service.create_product(uow, new_id, body, base_url)
        await uow.commit()
    return ok(result)


@router.put("/products/{product_id}")
async def update_product(
    product_id: str, body: ProductIn, request: Request, principal: Writer, base_url: MediaBase
) -> ApiResponse[ProductOut]:
    async with open_uow(request, principal.tenant_id) as uow:
        result = await service.update_product(uow, product_id, body, base_url)
        await uow.commit()
    return ok(result)


@router.delete("/products/{product_id}")
async def delete_product(product_id: str, request: Request, principal: Writer) -> ApiResponse[None]:
    async with open_uow(request, principal.tenant_id) as uow:
        await service.delete_product(uow, product_id)
        await uow.commit()
    return ok(None)


@router.get("/modifier-groups")
async def list_modifier_groups(
    request: Request, principal: Reader
) -> ApiResponse[list[ModifierGroupOut]]:
    async with open_uow(request, principal.tenant_id) as uow:
        return ok(await service.list_modifier_groups(uow))


@router.post("/modifier-groups", status_code=status.HTTP_201_CREATED)
async def create_modifier_group(
    body: ModifierGroupIn, request: Request, principal: Writer, new_id: NewId
) -> ApiResponse[ModifierGroupOut]:
    async with open_uow(request, principal.tenant_id) as uow:
        result = await service.create_modifier_group(uow, new_id, body)
        await uow.commit()
    return ok(result)


@router.put("/modifier-groups/{group_id}")
async def update_modifier_group(
    group_id: str, body: ModifierGroupIn, request: Request, principal: Writer, new_id: NewId
) -> ApiResponse[ModifierGroupOut]:
    async with open_uow(request, principal.tenant_id) as uow:
        result = await service.update_modifier_group(uow, new_id, group_id, body)
        await uow.commit()
    return ok(result)


@router.delete("/modifier-groups/{group_id}")
async def delete_modifier_group(
    group_id: str, request: Request, principal: Writer
) -> ApiResponse[None]:
    async with open_uow(request, principal.tenant_id) as uow:
        await service.delete_modifier_group(uow, group_id)
        await uow.commit()
    return ok(None)


@router.get("/outlets/{outlet_id}/products")
async def list_outlet_products(
    outlet_id: str, request: Request, principal: Reader
) -> ApiResponse[list[OutletProductOut]]:
    async with open_uow(request, principal.tenant_id) as uow:
        await organization.get_outlet(uow, outlet_id)
        return ok(await service.list_outlet_products(uow, outlet_id))


@router.put("/outlets/{outlet_id}/products/{product_id}")
async def set_outlet_product(
    outlet_id: str, product_id: str, body: OutletProductIn, request: Request, principal: Writer
) -> ApiResponse[OutletProductOut]:
    """Price and availability at one outlet (06: outlet_products); price null = base price."""
    async with open_uow(request, principal.tenant_id) as uow:
        await organization.get_outlet(uow, outlet_id)
        result = await service.set_outlet_product(uow, outlet_id, product_id, body)
        await uow.commit()
    return ok(result)
