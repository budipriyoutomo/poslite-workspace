from dataclasses import replace
from datetime import datetime, time

import pytest

from poslite.sales.application.place_order import PlaceOrderHandler
from poslite.sales.domain.events import OrderPlaced
from poslite.sales.domain.value_objects import PriceBreakdown, Rates
from poslite.shared.application.ports import ChannelInfo, OutletProfile
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


class FakeQris:
    """QrisPort: references that are dynamic QRIS charges not paid yet."""

    def __init__(self, unpaid: set[str]) -> None:
        self._unpaid = unpaid

    async def unpaid(self, references: list[str]) -> set[str]:
        return {r for r in references if r in self._unpaid}


def with_qris_payment(reference: str) -> object:
    from dataclasses import replace

    from poslite.sales.domain.entities import Payment

    return replace(
        DATA,
        payments=(Payment("Y1", "M1", "qris", DATA.totals.total, reference),),
        change_amount=0,
    )


async def test_flags_an_order_paid_with_an_unpaid_dynamic_qris() -> None:
    order = with_qris_payment("01K5ZK00000000000000000001")

    outcome = await PlaceOrderHandler(
        outlets=FakeOutlets(),
        cashiers=FakeCashiers({"U1"}),
        qris=FakeQris({"01K5ZK00000000000000000001"}),
    )(order, CTX, FakeUnitOfWork())  # type: ignore[arg-type]

    assert outcome == EventOutcome("flagged", ("QRIS_UNPAID",))


async def test_a_paid_or_static_qris_is_not_flagged() -> None:
    order = with_qris_payment("QR-STATIC-123")

    outcome = await PlaceOrderHandler(
        outlets=FakeOutlets(), cashiers=FakeCashiers({"U1"}), qris=FakeQris(set())
    )(order, CTX, FakeUnitOfWork())  # type: ignore[arg-type]

    assert outcome == EventOutcome("accepted")


class FakeChannels:
    """ChannelPort (ADR-029): the outlet's brand channels."""

    def __init__(self, *channels: ChannelInfo) -> None:
        self._channels = channels

    async def channel(self, outlet_id: str, channel_id: str) -> ChannelInfo | None:
        return next((c for c in self._channels if c.id == channel_id), None)

    async def default(self, outlet_id: str, kind: str) -> ChannelInfo | None:
        return next((c for c in self._channels if c.kind == kind), None)


TAKE_AWAY = ChannelInfo("CH-TA", "take_away", applies_service=True, applies_tax=True)
GOFOOD = ChannelInfo(
    "CH-GO", "delivery", applies_service=False, applies_tax=True, requires_external_ref=True
)
# DATA sold on GoFood: no service, PB1 on the discounted 63.000 → 69.300.
ON_GOFOOD = replace(
    DATA,
    channel_id="CH-GO",
    external_ref="GF-123",
    rates=Rates(0, 1000),
    totals=PriceBreakdown(70_000, 7_000, 0, 6_300, 69_300),
    change_amount=30_700,
)


def channel_handler() -> PlaceOrderHandler:
    return PlaceOrderHandler(
        outlets=FakeOutlets(),
        cashiers=FakeCashiers({"U1"}),
        channels=FakeChannels(TAKE_AWAY, GOFOOD),
    )


async def test_an_order_on_a_channel_keeps_it_and_its_external_ref() -> None:
    uow = FakeUnitOfWork()

    outcome = await channel_handler()(ON_GOFOOD, CTX, uow)

    assert outcome == EventOutcome("accepted")
    order = uow.orders.rows["O1"]
    assert (order.channel_id, order.data.external_ref) == ("CH-GO", "GF-123")


async def test_rates_are_checked_against_what_the_channel_charges() -> None:
    with_service = replace(ON_GOFOOD, rates=Rates(500, 1000), totals=DATA.totals)

    outcome = await channel_handler()(with_service, CTX, FakeUnitOfWork())

    assert outcome == EventOutcome("flagged", ("RATES_OUTDATED",))


async def test_an_older_device_without_a_channel_sells_on_the_brand_channel_of_its_kind() -> None:
    uow = FakeUnitOfWork()

    outcome = await channel_handler()(DATA, CTX, uow)

    assert (outcome, uow.orders.rows["O1"].channel_id) == (EventOutcome("accepted"), "CH-TA")


async def test_an_unknown_channel_is_kept_on_the_channel_of_its_kind_and_flagged() -> None:
    uow = FakeUnitOfWork()

    outcome = await channel_handler()(replace(DATA, channel_id="CH-GONE"), CTX, uow)

    assert outcome == EventOutcome("flagged", ("CHANNEL_UNKNOWN",))
    assert uow.orders.rows["O1"].channel_id == "CH-TA"


async def test_a_missing_order_number_of_a_delivery_app_is_flagged() -> None:
    outcome = await channel_handler()(replace(ON_GOFOOD, external_ref=None), CTX, FakeUnitOfWork())

    assert outcome == EventOutcome("flagged", ("EXTERNAL_REF_MISSING",))


class FakeOpenBills:
    """OpenBillPort (ADR-031): bills closed by their payment."""

    def __init__(self) -> None:
        self.closed: list[tuple[str, str, str]] = []

    async def close(self, bill_id: str, *, outlet_id: str, order_id: str, at: datetime) -> None:
        self.closed.append((bill_id, outlet_id, order_id))


async def test_paying_a_shared_bill_closes_it() -> None:
    bills = FakeOpenBills()

    await PlaceOrderHandler(FakeOutlets(), FakeCashiers({"U1"}), bills=bills)(
        replace(DATA, closes_bill_id="B1"), CTX, FakeUnitOfWork()
    )

    assert bills.closed == [("B1", "T1", "O1")]


async def test_a_sale_without_a_bill_closes_nothing() -> None:
    bills = FakeOpenBills()

    await PlaceOrderHandler(FakeOutlets(), FakeCashiers({"U1"}), bills=bills)(
        DATA, CTX, FakeUnitOfWork()
    )

    assert bills.closed == []
