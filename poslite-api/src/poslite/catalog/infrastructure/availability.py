"""An outlet's sold-out marks set from the POS (P1-2), kept on outlet_products."""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from poslite.catalog.domain.availability import ChangeAvailability
from poslite.catalog.infrastructure.models import OutletProductModel, ProductModel
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork


async def product_in_brand(uow: SqlAlchemyUnitOfWork, product_id: str, brand_id: str) -> bool:
    product = await uow.session.get(ProductModel, product_id)
    return product is not None and product.deleted_at is None and product.brand_id == brand_id


async def last_availability_change(
    uow: SqlAlchemyUnitOfWork, outlet_id: str, product_id: str
) -> datetime | None:
    changed_at: datetime | None = await uow.session.scalar(
        select(OutletProductModel.availability_changed_at).where(
            OutletProductModel.outlet_id == outlet_id,
            OutletProductModel.product_id == product_id,
        )
    )
    return changed_at


async def apply_availability(
    uow: SqlAlchemyUnitOfWork, outlet_id: str, change: ChangeAvailability
) -> None:
    values = {
        "is_available": change.is_available,
        "available_until": None if change.is_available else change.until,
        "availability_changed_at": change.occurred_at,
    }
    await uow.session.execute(
        insert(OutletProductModel)
        .values(
            tenant_id=uow.tenant_id, outlet_id=outlet_id, product_id=change.product_id, **values
        )
        .on_conflict_do_update(index_elements=["outlet_id", "product_id"], set_=values)
    )
    product = await uow.session.get(ProductModel, change.product_id)
    if product is not None:
        product.updated_at = func.now()  # link-table change: devices pull the product again
    await uow.session.flush()
