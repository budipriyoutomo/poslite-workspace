"""Back-office access to brands and outlets (ADR-022), as FastAPI dependencies and checks.

Every back-office endpoint takes `Access` (or a brand dependency built on it) and checks the
brand or outlet it touches. Devices never come here: their scope is their outlet.
"""

from typing import Annotated

from fastapi import Depends, Header, Request

from poslite.identity.domain.access import AccessScope
from poslite.identity.infrastructure.service import assignments_of
from poslite.shared.domain.errors import DomainError
from poslite.shared.presentation.dependencies import open_uow
from poslite.shared.presentation.security import Principal, current_principal


async def access_scope(
    request: Request, principal: Annotated[Principal, Depends(current_principal)]
) -> AccessScope:
    if principal.owner_type != "user":
        return AccessScope.of([])
    async with open_uow(request, principal.tenant_id) as uow:
        return AccessScope.of(await assignments_of(uow, principal.owner_id))


Access = Annotated[AccessScope, Depends(access_scope)]
BrandHeader = Annotated[str | None, Header(alias="X-Brand-Id")]


def require_company(scope: AccessScope) -> None:
    """Company-level pages: users, payment methods, integrations, subscription, brands."""
    if not scope.company:
        raise DomainError(
            "COMPANY_SCOPE_REQUIRED", "Only company-wide users can do this", kind="forbidden"
        )


async def company_access(scope: Access) -> AccessScope:
    require_company(scope)
    return scope


CompanyAccess = Annotated[AccessScope, Depends(company_access)]
company_only = Depends(company_access)  # for `dependencies=[...]` on a route or router


def _brand(header: str | None) -> str:
    if not header:
        raise DomainError("BRAND_REQUIRED", "Send the active brand in X-Brand-Id")
    return header


async def readable_brand(scope: Access, x_brand_id: BrandHeader = None) -> str:
    brand_id = _brand(x_brand_id)
    if not scope.can_read_brand(brand_id):
        raise DomainError("BRAND_FORBIDDEN", "Brand is outside your access", kind="forbidden")
    return brand_id


async def managed_brand(scope: Access, x_brand_id: BrandHeader = None) -> str:
    brand_id = _brand(x_brand_id)
    if not scope.can_manage_brand(brand_id):
        raise DomainError("BRAND_FORBIDDEN", "You cannot change this brand", kind="forbidden")
    return brand_id


ReadBrand = Annotated[str, Depends(readable_brand)]
ManagedBrand = Annotated[str, Depends(managed_brand)]


def ensure_outlet(
    scope: AccessScope, *, outlet_id: str, brand_id: str, active_brand: str | None = None
) -> None:
    """The outlet is in the user's scope and, when a brand is active, belongs to it."""
    if not scope.can_access_outlet(outlet_id=outlet_id, brand_id=brand_id) or (
        active_brand is not None and active_brand != brand_id
    ):
        raise DomainError("OUTLET_FORBIDDEN", "Outlet is outside your access", kind="forbidden")
