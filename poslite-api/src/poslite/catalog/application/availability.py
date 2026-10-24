from datetime import datetime
from typing import Protocol

from poslite.catalog.domain.availability import ChangeAvailability, is_newer
from poslite.shared.application.ports import ApproverPort
from poslite.shared.application.sync import DeviceContext, EventOutcome
from poslite.shared.domain.errors import DomainError


class OutletAvailability(Protocol):
    async def sells(self, outlet_id: str, product_id: str) -> bool: ...
    async def last_change(self, outlet_id: str, product_id: str) -> datetime | None: ...
    async def apply(self, outlet_id: str, change: ChangeAvailability) -> None: ...


class ChangeAvailabilityHandler:
    """product.availability_changed → the outlet's sold-out mark. Never commits (ADR-010)."""

    def __init__(self, approvers: ApproverPort, availability: OutletAvailability) -> None:
        self._approvers, self._availability = approvers, availability

    async def __call__(self, cmd: ChangeAvailability, ctx: DeviceContext) -> EventOutcome:
        if not await self._approvers.can_approve(
            cmd.changed_by, ctx.outlet_id, "product.availability"
        ):
            raise DomainError(
                "APPROVER_NOT_ALLOWED", "User may not change availability", kind="forbidden"
            )
        if not await self._availability.sells(ctx.outlet_id, cmd.product_id):
            raise DomainError("PRODUCT_NOT_FOUND", "Product not found", kind="not_found")
        last = await self._availability.last_change(ctx.outlet_id, cmd.product_id)
        if is_newer(cmd.occurred_at, last):
            await self._availability.apply(ctx.outlet_id, cmd)
        return EventOutcome("accepted")
