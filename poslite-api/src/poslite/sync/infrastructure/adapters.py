from poslite.identity import api as identity
from poslite.organization import api as organization
from poslite.payment import api as payment
from poslite.shared.application.ports import OutletProfile
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork


class OrganizationOutlets:
    """OutletPort over the organization module, inside the push transaction."""

    def __init__(self, uow: SqlAlchemyUnitOfWork) -> None:
        self._uow = uow

    async def profile(self, outlet_id: str) -> OutletProfile:
        return await organization.outlet_profile(self._uow, outlet_id)


class IdentityCashiers:
    """CashierPort over the identity module, inside the push transaction."""

    def __init__(self, uow: SqlAlchemyUnitOfWork) -> None:
        self._uow = uow

    async def can_work(self, user_id: str, outlet_id: str) -> bool:
        return await identity.can_work(self._uow, user_id=user_id, outlet_id=outlet_id)


class PaymentQris:
    """QrisPort over the payment module, inside the push transaction (ADR-019)."""

    def __init__(self, uow: SqlAlchemyUnitOfWork) -> None:
        self._uow = uow

    async def unpaid(self, references: list[str]) -> set[str]:
        return await payment.unpaid_charges(self._uow, references)
