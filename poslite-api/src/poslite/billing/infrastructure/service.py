from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.billing.application.schemas import InvoiceOut, SubscriptionOut
from poslite.billing.domain.rules import (
    GRACE_DAYS,
    due_period,
    invoice_amount,
    is_overdue,
    trial_end,
)
from poslite.billing.infrastructure.models import InvoiceModel, SubscriptionModel
from poslite.organization import api as organization
from poslite.shared.application.payment_gateway import PaymentGateway
from poslite.shared.domain.errors import DomainError
from poslite.shared.domain.ids import new_ulid
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork
from poslite.tenancy import api as tenancy


@dataclass(frozen=True, slots=True)
class BillingStats:
    started: int
    issued: int
    suspended: int


async def run_billing(
    *,
    system: async_sessionmaker[AsyncSession],
    gateway: PaymentGateway,
    now: datetime,
    price_per_outlet: int,
    new_id: Callable[[], str] = new_ulid,
) -> BillingStats:
    """Daily job (ADR-018), as poslite_system across tenants: start trials, issue the invoice of
    a period that began, and suspend tenants whose invoice is past its grace days."""
    started = issued = suspended = 0
    async with system() as session, session.begin():
        subs = {s.tenant_id: s for s in await session.scalars(select(SubscriptionModel))}
        for tenant in await tenancy.all_tenants(session):
            if tenant.id not in subs:
                sub = SubscriptionModel(
                    tenant_id=tenant.id,
                    status="trialing",
                    trial_ends_at=trial_end(tenant.created_at),
                )
                session.add(sub)
                subs[tenant.id] = sub
                started += 1
        await session.flush()

        for sub in subs.values():
            period = due_period(
                sub.status,
                trial_ends_at=sub.trial_ends_at,
                period_end=sub.current_period_end,
                now=now,
            )
            if period is not None and not await _invoiced(session, sub.tenant_id, period[0]):
                await _issue(
                    session, gateway, sub.tenant_id, period, price_per_outlet, new_id(), now
                )
                issued += 1
            for invoice in await session.scalars(
                select(InvoiceModel).where(
                    InvoiceModel.tenant_id == sub.tenant_id, InvoiceModel.status == "open"
                )
            ):
                if is_overdue(invoice.status, due_at=invoice.due_at, now=now):
                    sub.status = "past_due"
                    if await tenancy.suspend_for_billing(session, sub.tenant_id):
                        suspended += 1
    return BillingStats(started, issued, suspended)


async def _invoiced(session: AsyncSession, tenant_id: str, start: date) -> bool:
    return (
        await session.scalar(
            select(InvoiceModel.id).where(
                InvoiceModel.tenant_id == tenant_id, InvoiceModel.period_start == start
            )
        )
    ) is not None


async def _issue(
    session: AsyncSession,
    gateway: PaymentGateway,
    tenant_id: str,
    period: tuple[date, date],
    price: int,
    invoice_id: str,
    now: datetime,
) -> None:
    start, end = period
    outlets = await organization.active_outlet_count(session, tenant_id)
    amount = invoice_amount(outlets=outlets, price_per_outlet=price)
    invoice = InvoiceModel(
        id=invoice_id,
        tenant_id=tenant_id,
        period_start=start,
        period_end=end,
        outlet_count=outlets,
        unit_price=price,
        amount=amount,
        due_at=datetime.combine(start, time(), now.tzinfo) + timedelta(days=GRACE_DAYS),
    )
    session.add(invoice)
    await session.flush()
    charge = await gateway.create_payment_link(
        reference=invoice_id,
        amount=amount,
        description=f"POSLite {start} - {end}, {outlets} outlet",
    )
    invoice.gateway_ref, invoice.payment_url = charge.gateway_ref, charge.payment_url


async def mark_invoice_paid(session: AsyncSession, gateway_ref: str, paid_at: datetime) -> bool:
    """Gateway notification (ADR-017/018): True if the reference is an invoice.

    A repeated notification changes nothing."""
    invoice = await session.scalar(
        select(InvoiceModel).where(InvoiceModel.gateway_ref == gateway_ref).with_for_update()
    )
    if invoice is None:
        return False
    if invoice.status != "paid":
        await _settle(session, invoice, paid_at)
    return True


async def settle_invoice(session: AsyncSession, invoice_id: str, paid_at: datetime) -> str:
    """An operator records an invoice paid outside the gateway (e.g. bank transfer); same effect
    as the gateway notification. Returns the invoice's tenant id."""
    invoice = await session.scalar(
        select(InvoiceModel).where(InvoiceModel.id == invoice_id).with_for_update()
    )
    if invoice is None:
        raise DomainError("INVOICE_NOT_FOUND", "Invoice not found", kind="not_found")
    if invoice.status != "open":
        raise DomainError(
            "INVOICE_ALREADY_PAID", f"Invoice is already {invoice.status}", kind="conflict"
        )
    await _settle(session, invoice, paid_at)
    return invoice.tenant_id


async def _settle(session: AsyncSession, invoice: InvoiceModel, paid_at: datetime) -> None:
    """Paid: the paid period extends the subscription; with nothing else open the tenant is
    active again (a billing suspension is lifted, a manual one stays)."""
    invoice.status, invoice.paid_at = "paid", paid_at
    sub = await session.get_one(SubscriptionModel, invoice.tenant_id)
    if sub.current_period_end is None or invoice.period_end > sub.current_period_end:
        sub.current_period_end = invoice.period_end
    still_open = await session.scalar(
        select(InvoiceModel.id).where(
            InvoiceModel.tenant_id == invoice.tenant_id,
            InvoiceModel.status == "open",
            InvoiceModel.id != invoice.id,
        )
    )
    if still_open is None:
        sub.status = "active"
        await tenancy.reactivate_after_payment(session, invoice.tenant_id)


async def extend_trial(
    session: AsyncSession, *, tenant_id: str, signed_up_at: datetime, days: int
) -> datetime:
    """An operator lengthens a trial (ADR-018). Before the first billing run the subscription is
    started here, from the sign-up date, exactly as the job would. Returns the new trial end."""
    sub = await session.get(SubscriptionModel, tenant_id, with_for_update=True)
    if sub is None:
        sub = SubscriptionModel(
            tenant_id=tenant_id, status="trialing", trial_ends_at=trial_end(signed_up_at)
        )
        session.add(sub)
    elif sub.status != "trialing":
        raise DomainError(
            "TRIAL_NOT_ACTIVE", "The tenant is no longer in its trial", kind="conflict"
        )
    sub.trial_ends_at = sub.trial_ends_at + timedelta(days=days)
    await session.flush()
    return sub.trial_ends_at


async def subscription_view(uow: SqlAlchemyUnitOfWork) -> SubscriptionOut | None:
    sub = await uow.session.get(SubscriptionModel, uow.tenant_id)
    if sub is None:
        return None
    invoices = await uow.session.scalars(
        select(InvoiceModel).order_by(InvoiceModel.period_start.desc())
    )
    return SubscriptionOut(
        status=sub.status,
        trial_ends_at=sub.trial_ends_at,
        current_period_end=sub.current_period_end,
        invoices=[InvoiceOut.model_validate(i, from_attributes=True) for i in invoices],
    )


async def subscription_of(session: AsyncSession, tenant_id: str) -> SubscriptionOut | None:
    """Any tenant's subscription and invoices, newest first (poslite_system: operator console)."""
    sub = await session.get(SubscriptionModel, tenant_id)
    invoices = await session.scalars(
        select(InvoiceModel)
        .where(InvoiceModel.tenant_id == tenant_id)
        .order_by(InvoiceModel.period_start.desc())
    )
    if sub is None:
        return None
    return SubscriptionOut(
        status=sub.status,
        trial_ends_at=sub.trial_ends_at,
        current_period_end=sub.current_period_end,
        invoices=[InvoiceOut.model_validate(i, from_attributes=True) for i in invoices],
    )
