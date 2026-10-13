from collections.abc import Callable

from sqlalchemy import delete, func, select

from poslite.payment.application.schemas import PaymentMethodIn, PaymentMethodOut
from poslite.payment.infrastructure.models import OutletPaymentMethodModel, PaymentMethodModel
from poslite.shared.application.sync import Change
from poslite.shared.domain.errors import DomainError
from poslite.shared.infrastructure.sync_feed import feed
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork


def _out(m: PaymentMethodModel, outlet_ids: list[str]) -> PaymentMethodOut:
    return PaymentMethodOut.model_validate(
        {
            "id": m.id,
            "type": m.type,
            "name": m.name,
            "requires_reference": m.requires_reference,
            "sort_order": m.sort_order,
            "logo_url": m.logo_url,
            "outlet_ids": outlet_ids,
        }
    )


async def _outlets_of(uow: SqlAlchemyUnitOfWork, method_ids: list[str]) -> dict[str, list[str]]:
    rows = await uow.session.execute(
        select(OutletPaymentMethodModel.payment_method_id, OutletPaymentMethodModel.outlet_id)
        .where(OutletPaymentMethodModel.payment_method_id.in_(method_ids))
        .order_by(OutletPaymentMethodModel.outlet_id)
    )
    result: dict[str, list[str]] = {m: [] for m in method_ids}
    for method_id, outlet_id in rows:
        result[method_id].append(outlet_id)
    return result


async def _live(uow: SqlAlchemyUnitOfWork, method_id: str) -> PaymentMethodModel:
    row = await uow.session.get(PaymentMethodModel, method_id)
    if row is None or row.deleted_at is not None:
        raise DomainError("PAYMENT_METHOD_NOT_FOUND", kind="not_found")
    return row


async def list_payment_methods(uow: SqlAlchemyUnitOfWork) -> list[PaymentMethodOut]:
    rows = await uow.session.scalars(
        select(PaymentMethodModel)
        .where(PaymentMethodModel.deleted_at.is_(None))
        .order_by(PaymentMethodModel.sort_order, PaymentMethodModel.name)
    )
    methods = list(rows)
    outlets = await _outlets_of(uow, [m.id for m in methods])
    return [_out(m, outlets[m.id]) for m in methods]


async def create_payment_method(
    uow: SqlAlchemyUnitOfWork,
    new_id: Callable[[], str],
    body: PaymentMethodIn,
    *,
    outlet_ids: list[str],
) -> PaymentMethodOut:
    row = PaymentMethodModel(id=new_id(), tenant_id=uow.tenant_id, **body.model_dump())
    uow.session.add(row)
    await uow.session.flush()
    await _link(uow, row.id, outlet_ids)
    return _out(row, sorted(set(outlet_ids)))


async def _link(uow: SqlAlchemyUnitOfWork, method_id: str, outlet_ids: list[str]) -> None:
    uow.session.add_all(
        OutletPaymentMethodModel(tenant_id=uow.tenant_id, outlet_id=o, payment_method_id=method_id)
        for o in sorted(set(outlet_ids))
    )
    await uow.session.flush()


async def set_method_outlets(
    uow: SqlAlchemyUnitOfWork, method_id: str, outlet_ids: list[str]
) -> PaymentMethodOut:
    """Replace where the method is taken; re-versions it so devices pull it again (ADR-009)."""
    row = await _live(uow, method_id)
    await uow.session.execute(
        delete(OutletPaymentMethodModel).where(
            OutletPaymentMethodModel.payment_method_id == method_id
        )
    )
    await _link(uow, method_id, outlet_ids)
    row.updated_at = func.now()
    await uow.session.flush()
    return _out(row, sorted(set(outlet_ids)))


async def enable_all_methods(uow: SqlAlchemyUnitOfWork, outlet_id: str) -> None:
    """A new outlet takes every payment method of the company."""
    methods = await uow.session.scalars(
        select(PaymentMethodModel.id).where(PaymentMethodModel.deleted_at.is_(None))
    )
    uow.session.add_all(
        OutletPaymentMethodModel(tenant_id=uow.tenant_id, outlet_id=outlet_id, payment_method_id=m)
        for m in methods
    )
    await uow.session.flush()


async def inactive_methods(
    uow: SqlAlchemyUnitOfWork, outlet_id: str, method_ids: list[str]
) -> set[str]:
    """Methods of a sale that its outlet does not take (any more)."""
    active = set(
        await uow.session.scalars(
            select(OutletPaymentMethodModel.payment_method_id).where(
                OutletPaymentMethodModel.outlet_id == outlet_id,
                OutletPaymentMethodModel.payment_method_id.in_(method_ids),
            )
        )
    )
    return set(method_ids) - active


async def update_payment_method(
    uow: SqlAlchemyUnitOfWork, method_id: str, body: PaymentMethodIn
) -> PaymentMethodOut:
    row = await _live(uow, method_id)
    for key, value in body.model_dump().items():
        setattr(row, key, value)
    await uow.session.flush()
    return _out(row, (await _outlets_of(uow, [row.id]))[row.id])


async def delete_payment_method(uow: SqlAlchemyUnitOfWork, method_id: str) -> None:
    row = await _live(uow, method_id)
    row.deleted_at = func.now()
    await uow.session.flush()


async def payment_method_changes(
    uow: SqlAlchemyUnitOfWork, *, outlet_id: str, cursor: int, limit: int
) -> list[Change]:
    """Every changed method: `upsert` when the device's outlet takes it, else `delete` (the
    same pattern as users), so a device drops a method its outlet switched off."""
    changes = await feed(
        uow,
        PaymentMethodModel,
        "payment_method",
        cursor=cursor,
        limit=limit,
        data=lambda m: {
            "type": m.type,
            "name": m.name,
            "requires_reference": m.requires_reference,
            "sort_order": m.sort_order,
            "logo_url": m.logo_url,
        },
    )
    live = [c.id for c in changes if c.op == "upsert"]
    off = await inactive_methods(uow, outlet_id, live)
    return [
        Change(c.entity, "delete", c.id, c.version, None) if c.id in off else c for c in changes
    ]
