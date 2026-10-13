from poslite.identity import api as identity
from poslite.organization import api as organization
from poslite.payment import api as payment
from poslite.shared.application.ports import OutletProfile
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork
from poslite.shift.api import ShiftRepository


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
        outlet = await organization.get_outlet(self._uow, outlet_id)
        return await identity.can_work(
            self._uow, user_id=user_id, outlet_id=outlet.id, brand_id=outlet.brand_id
        )


class PaymentQris:
    """QrisPort over the payment module, inside the push transaction (ADR-019)."""

    def __init__(self, uow: SqlAlchemyUnitOfWork) -> None:
        self._uow = uow

    async def unpaid(self, references: list[str]) -> set[str]:
        return await payment.unpaid_charges(self._uow, references)


class IdentityApprovers:
    """ApproverPort over the identity module: permission of a role at an outlet (ADR-023)."""

    def __init__(self, uow: SqlAlchemyUnitOfWork) -> None:
        self._uow = uow

    async def can_approve(self, user_id: str, outlet_id: str, permission: str) -> bool:
        outlet = await organization.get_outlet(self._uow, outlet_id)
        return await identity.can_approve(
            self._uow,
            user_id=user_id,
            outlet_id=outlet.id,
            brand_id=outlet.brand_id,
            permission=permission,
        )


class ShiftStatuses:
    """ShiftStatusPort over the shift repository of the same push transaction."""

    def __init__(self, shifts: ShiftRepository) -> None:
        self._shifts = shifts

    async def status(self, shift_id: str) -> str | None:
        shift = await self._shifts.get(shift_id)
        return shift.status if shift else None


class PaymentMethods:
    """PaymentMethodPort over the payment module, inside the push transaction."""

    def __init__(self, uow: SqlAlchemyUnitOfWork) -> None:
        self._uow = uow

    async def inactive(self, outlet_id: str, method_ids: list[str]) -> set[str]:
        return await payment.inactive_methods(self._uow, outlet_id, method_ids)
