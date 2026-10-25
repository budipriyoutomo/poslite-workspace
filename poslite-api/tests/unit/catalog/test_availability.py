"""P1-2: a sold-out mark from the POS; the change made last wins, whatever order devices sync in."""

from datetime import UTC, datetime

import pytest

from poslite.catalog.application.availability import ChangeAvailabilityHandler
from poslite.catalog.domain.availability import ChangeAvailability
from poslite.shared.application.sync import DeviceContext, EventOutcome
from poslite.shared.domain.errors import DomainError

CTX = DeviceContext(tenant_id="TN", device_id="D1", outlet_id="T1")
AT = datetime(2026, 9, 25, 5, 0, tzinfo=UTC)


def change(at: datetime = AT, by: str = "U1") -> ChangeAvailability:
    return ChangeAvailability("P1", False, None, by, at)


class FakeApprovers:
    async def can_approve(self, user_id: str, outlet_id: str, permission: str) -> bool:
        return user_id == "U1" and permission == "product.availability"


class FakeAvailability:
    def __init__(self, last: datetime | None = None) -> None:
        self.last, self.applied = last, list[ChangeAvailability]()

    async def sells(self, outlet_id: str, product_id: str) -> bool:
        return product_id == "P1"

    async def last_change(self, outlet_id: str, product_id: str) -> datetime | None:
        return self.last

    async def apply(self, outlet_id: str, change: ChangeAvailability) -> None:
        self.applied.append(change)


async def test_applies_a_newer_change() -> None:
    store = FakeAvailability(last=datetime(2026, 9, 25, 4, 0, tzinfo=UTC))

    outcome = await ChangeAvailabilityHandler(FakeApprovers(), store)(change(), CTX)

    assert (outcome, store.applied) == (EventOutcome("accepted"), [change()])


async def test_an_older_change_is_accepted_but_changes_nothing() -> None:
    store = FakeAvailability(last=datetime(2026, 9, 25, 6, 0, tzinfo=UTC))

    outcome = await ChangeAvailabilityHandler(FakeApprovers(), store)(change(), CTX)

    assert (outcome, store.applied) == (EventOutcome("accepted"), [])


async def test_needs_the_permission() -> None:
    with pytest.raises(DomainError) as err:
        await ChangeAvailabilityHandler(FakeApprovers(), FakeAvailability())(change(by="U9"), CTX)

    assert err.value.code == "APPROVER_NOT_ALLOWED"
