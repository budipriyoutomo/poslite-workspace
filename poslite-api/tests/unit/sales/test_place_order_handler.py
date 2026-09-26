from datetime import time

import pytest

from poslite.sales.application.place_order import PlaceOrderHandler
from poslite.sales.domain.events import OrderPlaced
from poslite.shared.application.ports import OutletProfile
from poslite.shared.application.sync import DeviceContext, EventOutcome
from poslite.shared.domain.errors import DomainError

from ..fakes import FakeCashiers, FakeOutlets, FakeUnitOfWork
from .test_order import DATA

CTX = DeviceContext(tenant_id="TN", device_id="D1", outlet_id="T1")


def handler(cashiers: set[str] | None = None) -> PlaceOrderHandler:
    return PlaceOrderHandler(outlets=FakeOutlets(), cashiers=FakeCashiers(cashiers or {"U1"}))


async def test_stores_the_order_and_records_its_event_without_committing() -> None:
    uow = FakeUnitOfWork()

    outcome = await handler()(DATA, CTX, uow)

    assert outcome == EventOutcome("accepted")
    assert uow.orders.rows["O1"].business_date.isoformat() == "2026-09-25"
    assert [type(e) for e in uow.events] == [OrderPlaced]
    assert uow.committed is False


async def test_reports_flags_as_flagged() -> None:
    pb1_raised = OutletProfile(
        service_bps=500, tax_bps=1100, timezone="Asia/Jakarta", business_day_cutoff=time(4, 0)
    )

    outcome = await PlaceOrderHandler(
        outlets=FakeOutlets(pb1_raised), cashiers=FakeCashiers({"U1"})
    )(DATA, CTX, FakeUnitOfWork())

    assert outcome == EventOutcome("flagged", ("RATES_OUTDATED",))


async def test_rejects_a_cashier_who_does_not_work_at_the_outlet() -> None:
    with pytest.raises(DomainError) as err:
        await handler(cashiers={"someone-else"})(DATA, CTX, FakeUnitOfWork())

    assert err.value.code == "CASHIER_NOT_IN_OUTLET"


async def test_rejects_an_order_id_that_already_exists() -> None:
    uow = FakeUnitOfWork()
    await handler()(DATA, CTX, uow)

    with pytest.raises(DomainError) as err:
        await handler()(DATA, CTX, uow)

    assert err.value.code == "ORDER_ALREADY_EXISTS"
