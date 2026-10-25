from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel

from poslite.catalog.infrastructure import menu_import as service
from poslite.catalog.presentation.router import _read_body
from poslite.identity import api as identity
from poslite.organization import api as organization
from poslite.shared.presentation.dependencies import id_factory, open_uow
from poslite.shared.presentation.envelope import ApiResponse, ok
from poslite.shared.presentation.security import Principal, require_ability

router = APIRouter(tags=["catalog"])
Writer = Annotated[Principal, Depends(require_ability("backoffice:write"))]
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
MAX_WORKBOOK_BYTES = 5 * 1024 * 1024


class RowErrorOut(BaseModel):
    sheet: str
    row: int
    message: str


class CountsOut(BaseModel):
    create: int
    update: int


class MenuImportOut(BaseModel):
    errors: list[RowErrorOut]
    categories: CountsOut
    modifier_groups: CountsOut
    products: CountsOut
    channel_prices: int
    outlet_prices: int
    applied: bool  # false: a preview, or a file with errors — nothing was written


@router.get("/menu-import/template", response_class=Response)
async def menu_template(_: Writer, __: identity.ManagedBrand) -> Response:
    """The workbook to fill in (P1-4): one sheet per part of the menu, with an example row."""
    return Response(
        service.template(),
        media_type=XLSX,
        headers={"Content-Disposition": 'attachment; filename="template-menu.xlsx"'},
    )


@router.post(
    "/menu-import",
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {XLSX: {"schema": {"type": "string", "format": "binary"}}},
        }
    },
)
async def import_menu(
    request: Request,
    principal: Writer,
    brand: identity.ManagedBrand,
    new_id: Annotated[Callable[[], str], Depends(id_factory)],
    dry_run: Annotated[bool, Query()] = True,
) -> ApiResponse[MenuImportOut]:
    """The filled workbook as the raw body (max 5 MB). `dry_run` previews; otherwise every row is
    upserted in one transaction, or none when any row has an error."""
    sheets = service.read_workbook(await _read_body(request, MAX_WORKBOOK_BYTES))
    async with open_uow(request, principal.tenant_id) as uow:
        outlets = {
            o.code.upper(): o.id
            for o in await organization.list_outlets(uow)
            if o.brand_id == brand
        }
        result = await service.import_menu(
            uow, new_id, sheets, brand_id=brand, outlets=outlets, dry_run=dry_run
        )
        if result.applied:
            await uow.commit()
    return ok(MenuImportOut.model_validate(result.as_dict()))
