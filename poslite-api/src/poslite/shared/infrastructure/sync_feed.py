from collections.abc import Callable
from typing import Any

from sqlalchemy import select
from sqlalchemy.sql import ColumnElement

from poslite.shared.application.sync import Change
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork


async def feed[M: Any](
    uow: SqlAlchemyUnitOfWork,
    model: type[M],
    entity: str,
    *,
    cursor: int,
    limit: int,
    data: Callable[[M], dict[str, object]],
    where: ColumnElement[bool] | None = None,
) -> list[Change]:
    """`version > cursor ORDER BY version LIMIT limit + 1` for one master table (RLS scopes tenant).

    Soft-deleted rows become `delete` changes without data.
    """
    query = select(model).where(model.version > cursor).order_by(model.version).limit(limit + 1)
    if where is not None:
        query = query.where(where)
    rows: list[M] = list(await uow.session.scalars(query))
    return [
        Change(entity=entity, op="delete", id=r.id, version=r.version, data=None)
        if r.deleted_at is not None
        else Change(entity=entity, op="upsert", id=r.id, version=r.version, data=data(r))
        for r in rows
    ]
