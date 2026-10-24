from datetime import datetime

from poslite.catalog import api as catalog
from poslite.identity import api as identity
from poslite.organization import api as organization
from poslite.payment import api as payment
from poslite.shared.application.ports import ChannelInfo, OutletProfile
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


class CatalogChannels:
    """ChannelPort over the catalog module: channels of the outlet's brand (ADR-029)."""

    def __init__(self, uow: SqlAlchemyUnitOfWork) -> None:
        self._uow = uow

    async def channel(self, outlet_id: str, channel_id: str) -> ChannelInfo | None:
        brand_id = await organization.brand_of_outlet(self._uow, outlet_id)
        return await catalog.channel_info(self._uow, brand_id=brand_id, channel_id=channel_id)

    async def default(self, outlet_id: str, kind: str) -> ChannelInfo | None:
        brand_id = await organization.brand_of_outlet(self._uow, outlet_id)
        return await catalog.default_channel(self._uow, brand_id=brand_id, kind=kind)


class CatalogAvailability:
    """OutletAvailability over the catalog module: sold-out marks from the POS (P1-2)."""

    def __init__(self, uow: SqlAlchemyUnitOfWork) -> None:
        self._uow = uow

    async def sells(self, outlet_id: str, product_id: str) -> bool:
        outlet = await organization.get_outlet(self._uow, outlet_id)
        return await catalog.product_in_brand(self._uow, product_id, outlet.brand_id)

    async def last_change(self, outlet_id: str, product_id: str) -> datetime | None:
        return await catalog.last_availability_change(self._uow, outlet_id, product_id)

    async def apply(self, outlet_id: str, change: catalog.ChangeAvailability) -> None:
        await catalog.apply_availability(self._uow, outlet_id, change)
