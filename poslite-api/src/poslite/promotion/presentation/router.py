from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status

from poslite.promotion.application.schemas import PromotionIn, PromotionOut
from poslite.promotion.infrastructure import service
from poslite.shared.presentation.dependencies import id_factory, open_uow
from poslite.shared.presentation.envelope import ApiResponse, ok
from poslite.shared.presentation.security import Principal, require_ability

router = APIRouter(tags=["promotion"])
Reader = Annotated[Principal, Depends(require_ability("backoffice:read"))]
Writer = Annotated[Principal, Depends(require_ability("backoffice:write"))]


@router.get("/promotions")
async def list_promotions(request: Request, principal: Reader) -> ApiResponse[list[PromotionOut]]:
    async with open_uow(request, principal.tenant_id) as uow:
        return ok(await service.list_promotions(uow))


@router.post("/promotions", status_code=status.HTTP_201_CREATED)
async def create_promotion(
    body: PromotionIn,
    request: Request,
    principal: Writer,
    new_id: Annotated[Callable[[], str], Depends(id_factory)],
) -> ApiResponse[PromotionOut]:
    """Devices evaluate promotions offline at payment time (ADR-016)."""
    async with open_uow(request, principal.tenant_id) as uow:
        result = await service.create_promotion(uow, new_id, body)
        await uow.commit()
    return ok(result)


@router.put("/promotions/{promotion_id}")
async def update_promotion(
    promotion_id: str, body: PromotionIn, request: Request, principal: Writer
) -> ApiResponse[PromotionOut]:
    async with open_uow(request, principal.tenant_id) as uow:
        result = await service.update_promotion(uow, promotion_id, body)
        await uow.commit()
    return ok(result)


@router.delete("/promotions/{promotion_id}")
async def delete_promotion(
    promotion_id: str, request: Request, principal: Writer
) -> ApiResponse[None]:
    async with open_uow(request, principal.tenant_id) as uow:
        await service.delete_promotion(uow, promotion_id)
        await uow.commit()
    return ok(None)
