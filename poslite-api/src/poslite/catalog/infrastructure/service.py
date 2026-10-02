from collections.abc import Callable

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError

from poslite.catalog.application.schemas import (
    CategoryIn,
    CategoryOut,
    ModifierGroupIn,
    ModifierGroupOut,
    OptionOut,
    OutletProductIn,
    OutletProductOut,
    ProductIn,
    ProductOut,
)
from poslite.catalog.infrastructure.models import (
    CategoryModel,
    ModifierGroupModel,
    ModifierOptionModel,
    OutletProductModel,
    ProductModel,
    ProductModifierGroupModel,
)
from poslite.shared.application.sync import Change
from poslite.shared.domain.errors import DomainError
from poslite.shared.domain.media import media_url
from poslite.shared.infrastructure.sync_feed import feed
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork

# Thin CRUD module (05-backend-architecture.md): no separate domain entities. Deletes are soft
# (deleted_at) so devices receive them as `op: "delete"` on pull; RLS scopes every query.


async def _live[M: (CategoryModel, ProductModel, ModifierGroupModel)](
    uow: SqlAlchemyUnitOfWork, model: type[M], row_id: str, code: str
) -> M:
    row = await uow.session.get(model, row_id)
    if row is None or row.deleted_at is not None:
        raise DomainError(code, kind="not_found")
    return row


# ── Categories ───────────────────────────────────────────────────────────────────────────────


def _category(c: CategoryModel) -> CategoryOut:
    return CategoryOut(
        id=c.id, name=c.name, sort_order=c.sort_order, color=c.color, print_role=c.print_role
    )


async def list_categories(uow: SqlAlchemyUnitOfWork) -> list[CategoryOut]:
    rows = await uow.session.scalars(
        select(CategoryModel)
        .where(CategoryModel.deleted_at.is_(None))
        .order_by(CategoryModel.sort_order, CategoryModel.name)
    )
    return [_category(c) for c in rows]


async def create_category(
    uow: SqlAlchemyUnitOfWork, new_id: Callable[[], str], body: CategoryIn
) -> CategoryOut:
    row = CategoryModel(id=new_id(), tenant_id=uow.tenant_id, **body.model_dump())
    uow.session.add(row)
    await uow.session.flush()
    return _category(row)


async def update_category(
    uow: SqlAlchemyUnitOfWork, category_id: str, body: CategoryIn
) -> CategoryOut:
    row = await _live(uow, CategoryModel, category_id, "CATEGORY_NOT_FOUND")
    for key, value in body.model_dump().items():
        setattr(row, key, value)
    await uow.session.flush()
    return _category(row)


async def delete_category(uow: SqlAlchemyUnitOfWork, category_id: str) -> None:
    row = await _live(uow, CategoryModel, category_id, "CATEGORY_NOT_FOUND")
    row.deleted_at = func.now()
    await uow.session.flush()


# ── Products ─────────────────────────────────────────────────────────────────────────────────


async def _group_ids(uow: SqlAlchemyUnitOfWork, product_ids: list[str]) -> dict[str, list[str]]:
    rows = await uow.session.execute(
        select(ProductModifierGroupModel.product_id, ProductModifierGroupModel.modifier_group_id)
        .where(ProductModifierGroupModel.product_id.in_(product_ids))
        .order_by(ProductModifierGroupModel.sort_order)
    )
    result: dict[str, list[str]] = {pid: [] for pid in product_ids}
    for product_id, group_id in rows:
        result[product_id].append(group_id)
    return result


def _product(p: ProductModel, group_ids: list[str], base_url: str) -> ProductOut:
    return ProductOut(
        id=p.id,
        category_id=p.category_id,
        sku=p.sku,
        name=p.name,
        price=p.price,
        image_key=p.image_key,
        image_url=media_url(base_url, p.image_key),
        is_available=p.is_available,
        modifier_group_ids=group_ids,
    )


async def list_products(uow: SqlAlchemyUnitOfWork, base_url: str) -> list[ProductOut]:
    rows = list(
        await uow.session.scalars(
            select(ProductModel)
            .where(ProductModel.deleted_at.is_(None))
            .order_by(ProductModel.name)
        )
    )
    groups = await _group_ids(uow, [p.id for p in rows])
    return [_product(p, groups[p.id], base_url) for p in rows]


async def _check_references(
    uow: SqlAlchemyUnitOfWork, body: ProductIn, current_image: str | None = None
) -> None:
    await _live(uow, CategoryModel, body.category_id, "CATEGORY_NOT_FOUND")
    own = f"{uow.tenant_id}/products/"
    if body.image_key not in (None, current_image) and not body.image_key.startswith(own):
        raise DomainError("INVALID_IMAGE_KEY", "Upload the image with POST /media/images first")
    for group_id in body.modifier_group_ids:
        await _live(uow, ModifierGroupModel, group_id, "MODIFIER_GROUP_NOT_FOUND")


async def _set_groups(uow: SqlAlchemyUnitOfWork, product_id: str, group_ids: list[str]) -> None:
    await uow.session.execute(
        delete(ProductModifierGroupModel).where(ProductModifierGroupModel.product_id == product_id)
    )
    uow.session.add_all(
        ProductModifierGroupModel(
            tenant_id=uow.tenant_id, product_id=product_id, modifier_group_id=g, sort_order=i
        )
        for i, g in enumerate(dict.fromkeys(group_ids))
    )


async def _flush_unique_sku(uow: SqlAlchemyUnitOfWork) -> None:
    try:
        async with uow.session.begin_nested():
            await uow.session.flush()
    except IntegrityError as err:
        raise DomainError(
            "SKU_TAKEN", "SKU is already used by another product", kind="conflict"
        ) from err


async def create_product(
    uow: SqlAlchemyUnitOfWork, new_id: Callable[[], str], body: ProductIn, base_url: str
) -> ProductOut:
    await _check_references(uow, body)
    row = ProductModel(
        id=new_id(), tenant_id=uow.tenant_id, **body.model_dump(exclude={"modifier_group_ids"})
    )
    uow.session.add(row)
    await _flush_unique_sku(uow)
    await _set_groups(uow, row.id, body.modifier_group_ids)
    await uow.session.flush()
    return _product(row, list(dict.fromkeys(body.modifier_group_ids)), base_url)


async def update_product(
    uow: SqlAlchemyUnitOfWork, product_id: str, body: ProductIn, base_url: str
) -> ProductOut:
    """Full replace. The UPDATE re-versions the product, which carries its modifier group links."""
    row = await _live(uow, ProductModel, product_id, "PRODUCT_NOT_FOUND")
    await _check_references(uow, body, current_image=row.image_key)
    for key, value in body.model_dump(exclude={"modifier_group_ids"}).items():
        setattr(row, key, value)
    row.updated_at = func.now()
    await _flush_unique_sku(uow)
    await _set_groups(uow, row.id, body.modifier_group_ids)
    await uow.session.flush()
    return _product(row, list(dict.fromkeys(body.modifier_group_ids)), base_url)


async def delete_product(uow: SqlAlchemyUnitOfWork, product_id: str) -> None:
    row = await _live(uow, ProductModel, product_id, "PRODUCT_NOT_FOUND")
    row.deleted_at = func.now()
    await uow.session.flush()


# ── Modifier groups ──────────────────────────────────────────────────────────────────────────


async def _options(uow: SqlAlchemyUnitOfWork, group_ids: list[str]) -> dict[str, list[OptionOut]]:
    rows = await uow.session.scalars(
        select(ModifierOptionModel)
        .where(
            ModifierOptionModel.modifier_group_id.in_(group_ids),
            ModifierOptionModel.deleted_at.is_(None),
        )
        .order_by(ModifierOptionModel.sort_order)
    )
    result: dict[str, list[OptionOut]] = {g: [] for g in group_ids}
    for o in rows:
        result[o.modifier_group_id].append(OptionOut(id=o.id, name=o.name, price=o.price))
    return result


def _group(g: ModifierGroupModel, options: list[OptionOut]) -> ModifierGroupOut:
    return ModifierGroupOut(
        id=g.id, name=g.name, min_select=g.min_select, max_select=g.max_select, options=options
    )


def _check_range(body: ModifierGroupIn) -> None:
    if body.min_select > body.max_select:
        raise DomainError("INVALID_SELECTION_RANGE", "min_select must not exceed max_select")


async def list_modifier_groups(uow: SqlAlchemyUnitOfWork) -> list[ModifierGroupOut]:
    rows = list(
        await uow.session.scalars(
            select(ModifierGroupModel)
            .where(ModifierGroupModel.deleted_at.is_(None))
            .order_by(ModifierGroupModel.name)
        )
    )
    options = await _options(uow, [g.id for g in rows])
    return [_group(g, options[g.id]) for g in rows]


async def _save_options(
    uow: SqlAlchemyUnitOfWork, new_id: Callable[[], str], group_id: str, body: ModifierGroupIn
) -> None:
    """Upsert the given options (by id) and soft-delete the ones that were left out."""
    kept: list[str] = []
    for i, option in enumerate(body.options):
        if option.id:
            await uow.session.execute(
                update(ModifierOptionModel)
                .where(
                    ModifierOptionModel.id == option.id,
                    ModifierOptionModel.modifier_group_id == group_id,
                )
                .values(name=option.name, price=option.price, sort_order=i, updated_at=func.now())
            )
            kept.append(option.id)
        else:
            option_id = new_id()
            uow.session.add(
                ModifierOptionModel(
                    id=option_id,
                    tenant_id=uow.tenant_id,
                    modifier_group_id=group_id,
                    name=option.name,
                    price=option.price,
                    sort_order=i,
                )
            )
            kept.append(option_id)
    await uow.session.flush()
    await uow.session.execute(
        update(ModifierOptionModel)
        .where(
            ModifierOptionModel.modifier_group_id == group_id,
            ModifierOptionModel.id.not_in(kept),
            ModifierOptionModel.deleted_at.is_(None),
        )
        .values(deleted_at=func.now())
    )


async def create_modifier_group(
    uow: SqlAlchemyUnitOfWork, new_id: Callable[[], str], body: ModifierGroupIn
) -> ModifierGroupOut:
    _check_range(body)
    row = ModifierGroupModel(
        id=new_id(),
        tenant_id=uow.tenant_id,
        name=body.name,
        min_select=body.min_select,
        max_select=body.max_select,
    )
    uow.session.add(row)
    await uow.session.flush()
    await _save_options(uow, new_id, row.id, body)
    return _group(row, (await _options(uow, [row.id]))[row.id])


async def update_modifier_group(
    uow: SqlAlchemyUnitOfWork, new_id: Callable[[], str], group_id: str, body: ModifierGroupIn
) -> ModifierGroupOut:
    _check_range(body)
    row = await _live(uow, ModifierGroupModel, group_id, "MODIFIER_GROUP_NOT_FOUND")
    row.name, row.min_select, row.max_select = body.name, body.min_select, body.max_select
    row.updated_at = func.now()
    await uow.session.flush()
    await _save_options(uow, new_id, row.id, body)
    return _group(row, (await _options(uow, [row.id]))[row.id])


async def delete_modifier_group(uow: SqlAlchemyUnitOfWork, group_id: str) -> None:
    row = await _live(uow, ModifierGroupModel, group_id, "MODIFIER_GROUP_NOT_FOUND")
    row.deleted_at = func.now()
    await uow.session.flush()


# ── Sync pull feeds ──────────────────────────────────────────────────────────────────────────


async def catalog_changes(
    uow: SqlAlchemyUnitOfWork, *, outlet_id: str, cursor: int, limit: int
) -> list[list[Change]]:
    products = await feed(
        uow,
        ProductModel,
        "product",
        cursor=cursor,
        limit=limit,
        data=lambda p: {
            "category_id": p.category_id,
            "sku": p.sku,
            "name": p.name,
            "price": p.price,
            "image_key": p.image_key,
            "is_available": p.is_available,
        },
    )
    live = [c.id for c in products if c.data is not None]
    groups = await _group_ids(uow, live)
    overrides = await _overrides(uow, outlet_id, live)
    products = [
        Change(
            c.entity,
            c.op,
            c.id,
            c.version,
            _effective(c.data, overrides.get(c.id)) | {"modifier_group_ids": groups[c.id]},
        )
        if c.data
        else c
        for c in products
    ]
    return [
        await feed(
            uow,
            CategoryModel,
            "category",
            cursor=cursor,
            limit=limit,
            data=lambda c: {"name": c.name, "sort_order": c.sort_order, "print_role": c.print_role},
        ),
        products,
        await feed(
            uow,
            ModifierGroupModel,
            "modifier_group",
            cursor=cursor,
            limit=limit,
            data=lambda g: {"name": g.name, "min_select": g.min_select, "max_select": g.max_select},
        ),
        await feed(
            uow,
            ModifierOptionModel,
            "modifier_option",
            cursor=cursor,
            limit=limit,
            data=lambda o: {
                "modifier_group_id": o.modifier_group_id,
                "name": o.name,
                "price": o.price,
                "sort_order": o.sort_order,
            },
        ),
    ]


# ── Per-outlet price and availability ────────────────────────────────────────────────────────


async def _overrides(
    uow: SqlAlchemyUnitOfWork, outlet_id: str, product_ids: list[str]
) -> dict[str, OutletProductModel]:
    rows = await uow.session.scalars(
        select(OutletProductModel).where(
            OutletProductModel.outlet_id == outlet_id,
            OutletProductModel.product_id.in_(product_ids),
        )
    )
    return {r.product_id: r for r in rows}


def _effective(data: dict[str, object], override: OutletProductModel | None) -> dict[str, object]:
    """What this outlet sells: its own price if set; available only if both flags agree."""
    if override is None:
        return data
    return data | {
        "price": override.price if override.price is not None else data["price"],
        "is_available": bool(data["is_available"]) and override.is_available,
    }


async def set_outlet_product(
    uow: SqlAlchemyUnitOfWork, outlet_id: str, product_id: str, body: OutletProductIn
) -> OutletProductOut:
    product = await _live(uow, ProductModel, product_id, "PRODUCT_NOT_FOUND")
    values = {"price": body.price, "is_available": body.is_available}
    await uow.session.execute(
        insert(OutletProductModel)
        .values(tenant_id=uow.tenant_id, outlet_id=outlet_id, product_id=product_id, **values)
        .on_conflict_do_update(index_elements=["outlet_id", "product_id"], set_=values)
    )
    product.updated_at = func.now()  # link-table change → re-version the product so devices pull it
    await uow.session.flush()
    return OutletProductOut(
        product_id=product.id,
        name=product.name,
        base_price=product.price,
        price=body.price,
        effective_price=body.price if body.price is not None else product.price,
        is_available=body.is_available,
    )


async def list_outlet_products(uow: SqlAlchemyUnitOfWork, outlet_id: str) -> list[OutletProductOut]:
    products = list(
        await uow.session.scalars(
            select(ProductModel)
            .where(ProductModel.deleted_at.is_(None))
            .order_by(ProductModel.name)
        )
    )
    overrides = await _overrides(uow, outlet_id, [p.id for p in products])
    result = []
    for p in products:
        o = overrides.get(p.id)
        price = o.price if o else None
        result.append(
            OutletProductOut(
                product_id=p.id,
                name=p.name,
                base_price=p.price,
                price=price,
                effective_price=price if price is not None else p.price,
                is_available=p.is_available and (o.is_available if o else True),
            )
        )
    return result
