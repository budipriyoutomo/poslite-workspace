from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from poslite.payment.application.schemas import QrisChargeIn, QrisChargeOut
from poslite.payment.infrastructure.models import QrisChargeModel
from poslite.shared.application.payment_gateway import PaymentGateway
from poslite.shared.domain.errors import DomainError
from poslite.shared.infrastructure.flush import flush_or_conflict
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork

CHARGE_LIFETIME = timedelta(minutes=15)


def _out(c: QrisChargeModel, now: datetime) -> QrisChargeOut:
    """An unpaid charge past its expiry reads as expired; a later gateway payment still wins."""
    out = QrisChargeOut.model_validate(c, from_attributes=True)
    if out.status == "pending" and now >= out.expires_at:
        return out.model_copy(update={"status": "expired"})
    return out


async def create_qris_charge(
    uow: SqlAlchemyUnitOfWork,
    gateway: PaymentGateway,
    body: QrisChargeIn,
    *,
    outlet_id: str,
    device_id: str,
    now: datetime,
) -> QrisChargeOut:
    """A dynamic QR for one bill (ADR-019). The id comes from the device, so a retried request
    returns the same charge instead of a second one."""
    existing = await uow.session.get(QrisChargeModel, body.id)
    if existing is not None:
        if existing.amount != body.amount or existing.device_id != device_id:
            raise DomainError("ID_CONFLICT", "Charge id is already used", kind="conflict")
        return _out(existing, now)
    expires_at = now + CHARGE_LIFETIME
    charge = await gateway.create_qris(reference=body.id, amount=body.amount, expires_at=expires_at)
    row = QrisChargeModel(
        id=body.id,
        tenant_id=uow.tenant_id,
        outlet_id=outlet_id,
        device_id=device_id,
        amount=body.amount,
        gateway_ref=charge.gateway_ref,
        qr_string=charge.qr_string or "",
        expires_at=charge.expires_at or expires_at,
    )
    uow.session.add(row)
    await flush_or_conflict(uow.session)
    return _out(row, now)


async def get_qris_charge(
    uow: SqlAlchemyUnitOfWork, charge_id: str, *, now: datetime
) -> QrisChargeOut:
    row = await uow.session.get(QrisChargeModel, charge_id)
    if row is None:
        raise DomainError("CHARGE_NOT_FOUND", "QRIS charge not found", kind="not_found")
    return _out(row, now)


async def mark_qris_paid(session: AsyncSession, gateway_ref: str, paid_at: datetime) -> bool:
    """Gateway notification (as poslite_system): True if the reference is a QRIS charge."""
    row = await session.scalar(
        select(QrisChargeModel).where(QrisChargeModel.gateway_ref == gateway_ref).with_for_update()
    )
    if row is None:
        return False
    if row.status != "paid":
        row.status, row.paid_at = "paid", paid_at
    return True


async def unpaid_charges(uow: SqlAlchemyUnitOfWork, references: list[str]) -> set[str]:
    """Which references are dynamic charges not confirmed as paid (static references are not)."""
    rows = await uow.session.scalars(
        select(QrisChargeModel.id).where(
            QrisChargeModel.id.in_(references), QrisChargeModel.status != "paid"
        )
    )
    return set(rows)
