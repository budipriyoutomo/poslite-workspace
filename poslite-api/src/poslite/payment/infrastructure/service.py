from collections.abc import Callable

from sqlalchemy import func, select

from poslite.payment.application.schemas import PaymentMethodIn, PaymentMethodOut
from poslite.payment.infrastructure.models import PaymentMethodModel
from poslite.shared.domain.errors import DomainError
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork


def _out(m: PaymentMethodModel) -> PaymentMethodOut:
    return PaymentMethodOut.model_validate(
        {
            "id": m.id,
            "type": m.type,
            "name": m.name,
            "requires_reference": m.requires_reference,
            "sort_order": m.sort_order,
            "logo_url": m.logo_url,
        }
    )


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
    return [_out(m) for m in rows]


async def create_payment_method(
    uow: SqlAlchemyUnitOfWork, new_id: Callable[[], str], body: PaymentMethodIn
) -> PaymentMethodOut:
    row = PaymentMethodModel(id=new_id(), tenant_id=uow.tenant_id, **body.model_dump())
    uow.session.add(row)
    await uow.session.flush()
    return _out(row)


async def update_payment_method(
    uow: SqlAlchemyUnitOfWork, method_id: str, body: PaymentMethodIn
) -> PaymentMethodOut:
    row = await _live(uow, method_id)
    for key, value in body.model_dump().items():
        setattr(row, key, value)
    await uow.session.flush()
    return _out(row)


async def delete_payment_method(uow: SqlAlchemyUnitOfWork, method_id: str) -> None:
    row = await _live(uow, method_id)
    row.deleted_at = func.now()
    await uow.session.flush()
