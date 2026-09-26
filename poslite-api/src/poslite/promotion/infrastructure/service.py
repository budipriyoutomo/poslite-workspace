from collections.abc import Callable

from sqlalchemy import func, select

from poslite.promotion.application.schemas import PromotionIn, PromotionOut
from poslite.promotion.infrastructure.models import PromotionModel
from poslite.shared.application.sync import Change
from poslite.shared.domain.errors import DomainError
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork

_FIELDS = tuple(PromotionIn.model_fields)
# What a device needs to evaluate a promotion offline (07 "Pull": entity promotion).
_DEVICE_FIELDS = tuple(f for f in _FIELDS if f not in ("outlet_ids", "is_active"))


def _dump(m: PromotionModel, fields: tuple[str, ...]) -> dict[str, object]:
    values = {f: getattr(m, f) for f in fields}
    for day in ("starts_on", "ends_on"):
        if day in values and values[day] is not None:
            values[day] = values[day].isoformat()
    return values


def _out(m: PromotionModel) -> PromotionOut:
    return PromotionOut.model_validate({"id": m.id, **_dump(m, _FIELDS)})


async def _live(uow: SqlAlchemyUnitOfWork, promotion_id: str) -> PromotionModel:
    row = await uow.session.get(PromotionModel, promotion_id)
    if row is None or row.deleted_at is not None:
        raise DomainError("PROMOTION_NOT_FOUND", "Promotion not found", kind="not_found")
    return row


async def list_promotions(uow: SqlAlchemyUnitOfWork) -> list[PromotionOut]:
    rows = await uow.session.scalars(
        select(PromotionModel)
        .where(PromotionModel.deleted_at.is_(None))
        .order_by(PromotionModel.name)
    )
    return [_out(m) for m in rows]


async def create_promotion(
    uow: SqlAlchemyUnitOfWork, new_id: Callable[[], str], body: PromotionIn
) -> PromotionOut:
    row = PromotionModel(id=new_id(), tenant_id=uow.tenant_id, **body.model_dump())
    uow.session.add(row)
    await uow.session.flush()
    return _out(row)


async def update_promotion(
    uow: SqlAlchemyUnitOfWork, promotion_id: str, body: PromotionIn
) -> PromotionOut:
    row = await _live(uow, promotion_id)
    for key, value in body.model_dump().items():
        setattr(row, key, value)
    await uow.session.flush()
    return _out(row)


async def delete_promotion(uow: SqlAlchemyUnitOfWork, promotion_id: str) -> None:
    row = await _live(uow, promotion_id)
    row.deleted_at = func.now()
    await uow.session.flush()


async def promotion_changes(
    uow: SqlAlchemyUnitOfWork, *, outlet_id: str, cursor: int, limit: int
) -> list[Change]:
    """Every changed promotion, as `upsert` only if it is live, active and runs at this outlet.

    Anything else is a `delete`, so a device drops a promotion that was switched off, deleted
    or moved to other outlets (it may never have had it — deleting is then a no-op).
    """
    rows = await uow.session.scalars(
        select(PromotionModel)
        .where(PromotionModel.version > cursor)
        .order_by(PromotionModel.version)
        .limit(limit + 1)
    )
    changes = []
    for m in rows:
        applies = (
            m.deleted_at is None and m.is_active and (not m.outlet_ids or outlet_id in m.outlet_ids)
        )
        changes.append(
            Change(
                entity="promotion",
                op="upsert" if applies else "delete",
                id=m.id,
                version=m.version,
                data=_dump(m, _DEVICE_FIELDS) if applies else None,
            )
        )
    return changes
