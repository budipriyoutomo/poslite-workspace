"""Sales channels (ADR-029): brand master data, priced on the device from the channel's mode."""

from collections import defaultdict
from collections.abc import Callable

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from poslite.catalog.application.schemas import (
    ChannelPrice,
    ChannelPricesIn,
    SalesChannelIn,
    SalesChannelOut,
)
from poslite.catalog.infrastructure.models import (
    ChannelPriceModel,
    ProductModel,
    SalesChannelModel,
)
from poslite.shared.application.sync import Change
from poslite.shared.domain.errors import DomainError
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork

_FIELDS = tuple(SalesChannelIn.model_fields)
# What a device prices with offline (07 "Pull": entity sales_channel); inactive ones are deleted.
_DEVICE_FIELDS = tuple(f for f in _FIELDS if f != "is_active")
# Every brand sells at its tables and over the counter (migration 0025 seeds older brands).
SEED = (
    {"code": "DINE_IN", "name": "Dine In", "kind": "dine_in", "sort_order": 1},
    {"code": "TAKE_AWAY", "name": "Take Away", "kind": "take_away", "sort_order": 2},
)


async def _prices(
    uow: SqlAlchemyUnitOfWork, channel_ids: list[str]
) -> dict[str, list[ChannelPrice]]:
    rows = await uow.session.scalars(
        select(ChannelPriceModel)
        .where(ChannelPriceModel.channel_id.in_(channel_ids))
        .order_by(ChannelPriceModel.channel_id, ChannelPriceModel.product_id)
    )
    prices: dict[str, list[ChannelPrice]] = defaultdict(list)
    for r in rows:
        prices[r.channel_id].append(ChannelPrice(product_id=r.product_id, price=r.price))
    return prices


def _out(m: SalesChannelModel, prices: list[ChannelPrice]) -> SalesChannelOut:
    return SalesChannelOut.model_validate(
        {"id": m.id, **{f: getattr(m, f) for f in _FIELDS}, "prices": prices}
    )


async def _live(uow: SqlAlchemyUnitOfWork, channel_id: str, brand_id: str) -> SalesChannelModel:
    row = await uow.session.get(SalesChannelModel, channel_id)
    if row is None or row.deleted_at is not None or row.brand_id != brand_id:
        raise DomainError("CHANNEL_NOT_FOUND", "Sales channel not found", kind="not_found")
    return row


async def _flush_unique_code(uow: SqlAlchemyUnitOfWork) -> None:
    try:
        async with uow.session.begin_nested():
            await uow.session.flush()
    except IntegrityError as err:
        raise DomainError(
            "CHANNEL_CODE_TAKEN", "Another channel of this brand has that code", kind="conflict"
        ) from err


async def list_channels(uow: SqlAlchemyUnitOfWork, *, brand_id: str) -> list[SalesChannelOut]:
    rows = list(
        await uow.session.scalars(
            select(SalesChannelModel)
            .where(SalesChannelModel.brand_id == brand_id, SalesChannelModel.deleted_at.is_(None))
            .order_by(SalesChannelModel.sort_order, SalesChannelModel.name)
        )
    )
    prices = await _prices(uow, [r.id for r in rows])
    return [_out(r, prices[r.id]) for r in rows]


async def create_channel(
    uow: SqlAlchemyUnitOfWork, new_id: Callable[[], str], body: SalesChannelIn, *, brand_id: str
) -> SalesChannelOut:
    row = SalesChannelModel(
        id=new_id(), tenant_id=uow.tenant_id, brand_id=brand_id, **body.model_dump()
    )
    uow.session.add(row)
    await _flush_unique_code(uow)
    return _out(row, [])


async def seed_channels(
    uow: SqlAlchemyUnitOfWork, new_id: Callable[[], str], *, brand_id: str
) -> None:
    """Dine In and Take Away for a new brand (ADR-029)."""
    for channel in SEED:
        await create_channel(uow, new_id, SalesChannelIn.model_validate(channel), brand_id=brand_id)


async def update_channel(
    uow: SqlAlchemyUnitOfWork, channel_id: str, body: SalesChannelIn, *, brand_id: str
) -> SalesChannelOut:
    row = await _live(uow, channel_id, brand_id)
    for key, value in body.model_dump().items():
        setattr(row, key, value)
    row.updated_at = func.now()
    await _flush_unique_code(uow)
    return _out(row, (await _prices(uow, [row.id]))[row.id])


async def delete_channel(uow: SqlAlchemyUnitOfWork, channel_id: str, *, brand_id: str) -> None:
    """Soft delete: orders keep pointing at the channel they were sold on."""
    row = await _live(uow, channel_id, brand_id)
    row.deleted_at = func.now()
    await uow.session.flush()


async def set_channel_prices(
    uow: SqlAlchemyUnitOfWork, channel_id: str, body: ChannelPricesIn, *, brand_id: str
) -> SalesChannelOut:
    """Replaces the price list; products must be live products of the channel's brand."""
    row = await _live(uow, channel_id, brand_id)
    product_ids = {p.product_id for p in body.prices}
    if len(product_ids) != len(body.prices):
        raise DomainError("DUPLICATE_PRODUCT", "A product appears twice in the price list")
    found = set(
        await uow.session.scalars(
            select(ProductModel.id).where(
                ProductModel.id.in_(product_ids),
                ProductModel.brand_id == brand_id,
                ProductModel.deleted_at.is_(None),
            )
        )
    )
    if found != product_ids:
        raise DomainError("CROSS_BRAND_REFERENCE", "Rows of different brands cannot be linked")
    await uow.session.execute(
        delete(ChannelPriceModel).where(ChannelPriceModel.channel_id == row.id)
    )
    uow.session.add_all(
        ChannelPriceModel(
            tenant_id=uow.tenant_id, channel_id=row.id, product_id=p.product_id, price=p.price
        )
        for p in body.prices
    )
    row.updated_at = func.now()  # devices pull the channel again with its new prices (ADR-009)
    await uow.session.flush()
    return _out(row, (await _prices(uow, [row.id]))[row.id])


async def channel_changes(
    uow: SqlAlchemyUnitOfWork, *, brand_id: str, cursor: int, limit: int
) -> list[Change]:
    """Changed channels of the outlet's brand: `upsert` with prices while live and active,
    otherwise `delete` (a device may never have had it — deleting is then a no-op)."""
    rows = list(
        await uow.session.scalars(
            select(SalesChannelModel)
            .where(SalesChannelModel.version > cursor, SalesChannelModel.brand_id == brand_id)
            .order_by(SalesChannelModel.version)
            .limit(limit + 1)
        )
    )
    prices = await _prices(uow, [r.id for r in rows])
    changes = []
    for m in rows:
        sold = m.deleted_at is None and m.is_active
        data: dict[str, object] | None = None
        if sold:
            data = {f: getattr(m, f) for f in _DEVICE_FIELDS} | {
                "prices": [p.model_dump() for p in prices[m.id]]
            }
        changes.append(
            Change(
                entity="sales_channel",
                op="upsert" if sold else "delete",
                id=m.id,
                version=m.version,
                data=data,
            )
        )
    return changes
