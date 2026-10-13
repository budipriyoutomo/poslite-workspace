from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status

from poslite.catalog import api as catalog
from poslite.identity import api as identity
from poslite.organization import api as organization
from poslite.promotion.application.schemas import PromotionIn, PromotionOut
from poslite.promotion.infrastructure import service
from poslite.shared.domain.errors import DomainError
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork
from poslite.shared.presentation.dependencies import id_factory, open_uow
from poslite.shared.presentation.envelope import ApiResponse, ok
from poslite.shared.presentation.security import Principal, require_ability

router = APIRouter(tags=["promotion"])
Reader = Annotated[Principal, Depends(require_ability("backoffice:read"))]
Writer = Annotated[Principal, Depends(require_ability("backoffice:write"))]


async def _check_references(uow: SqlAlchemyUnitOfWork, brand_id: str, body: PromotionIn) -> None:
    """A promotion is brand master data: its products, categories and outlets are that brand's."""
    await organization.get_brand(uow, brand_id)
    await catalog.ensure_menu_in_brand(
        uow, brand_id, product_ids=body.product_ids, category_ids=body.category_ids
    )
    for outlet_id in body.outlet_ids:
        if (await organization.get_outlet(uow, outlet_id)).brand_id != brand_id:
            raise DomainError("CROSS_BRAND_REFERENCE", "Rows of different brands cannot be linked")


@router.get("/promotions")
async def list_promotions(
    request: Request, principal: Reader, brand: identity.ReadBrand
) -> ApiResponse[list[PromotionOut]]:
    async with open_uow(request, principal.tenant_id) as uow:
        return ok(await service.list_promotions(uow, brand_id=brand))


@router.post("/promotions", status_code=status.HTTP_201_CREATED)
async def create_promotion(
    body: PromotionIn,
    request: Request,
    principal: Writer,
    brand: identity.ManagedBrand,
    new_id: Annotated[Callable[[], str], Depends(id_factory)],
) -> ApiResponse[PromotionOut]:
    """Devices evaluate promotions offline at payment time (ADR-016)."""
    async with open_uow(request, principal.tenant_id) as uow:
        await _check_references(uow, brand, body)
        result = await service.create_promotion(uow, new_id, body, brand_id=brand)
        await uow.commit()
    return ok(result)


@router.put("/promotions/{promotion_id}")
async def update_promotion(
    promotion_id: str,
    body: PromotionIn,
    request: Request,
    principal: Writer,
    brand: identity.ManagedBrand,
) -> ApiResponse[PromotionOut]:
    async with open_uow(request, principal.tenant_id) as uow:
        await _check_references(uow, brand, body)
        result = await service.update_promotion(uow, promotion_id, body, brand_id=brand)
        await uow.commit()
    return ok(result)


@router.delete("/promotions/{promotion_id}")
async def delete_promotion(
    promotion_id: str, request: Request, principal: Writer, brand: identity.ManagedBrand
) -> ApiResponse[None]:
    async with open_uow(request, principal.tenant_id) as uow:
        await service.delete_promotion(uow, promotion_id, brand_id=brand)
        await uow.commit()
    return ok(None)
