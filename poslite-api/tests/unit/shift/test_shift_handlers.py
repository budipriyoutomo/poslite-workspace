from datetime import UTC, datetime

import pytest

from poslite.shared.application.sync import DeviceContext, EventOutcome
from poslite.shared.domain.errors import DomainError
from poslite.shift.application.handlers import (
    CloseShift,
    CloseShiftHandler,
    MoveCash,
    MoveCashHandler,
    OpenShift,
    OpenShiftHandler,
)

from ..fakes import FakeCashiers, FakeOutlets, FakeUnitOfWork

CTX = DeviceContext(tenant_id="TN", device_id="D1", outlet_id="T1")
AT = datetime(2026, 9, 25, 1, 0, tzinfo=UTC)
OPEN = OpenShift(shift_id="S1", opened_by="U1", opening_cash=200_000, occurred_at=AT)


async def opened(uow: FakeUnitOfWork) -> None:
    await OpenShiftHandler(FakeOutlets(), FakeCashiers({"U1"}))(OPEN, CTX, uow)


async def test_opens_a_shift_for_the_outlets_business_date() -> None:
    uow = FakeUnitOfWork()

    outcome = await OpenShiftHandler(FakeOutlets(), FakeCashiers({"U1"}))(OPEN, CTX, uow)

    assert outcome == EventOutcome("accepted")
    assert uow.shifts.rows["S1"].business_date.isoformat() == "2026-09-25"
    assert uow.committed is False


async def test_rejects_opening_by_someone_not_working_at_the_outlet() -> None:
    with pytest.raises(DomainError) as err:
        await OpenShiftHandler(FakeOutlets(), FakeCashiers(set()))(OPEN, CTX, FakeUnitOfWork())

    assert err.value.code == "CASHIER_NOT_IN_OUTLET"


async def test_closes_an_open_shift() -> None:
    uow = FakeUnitOfWork()
    await opened(uow)

    await CloseShiftHandler(FakeCashiers({"U1"}))(
        CloseShift(
            shift_id="S1",
            closed_by="U1",
            counted_cash=200_000,
            expected_cash=200_000,
            variance=0,
            occurred_at=AT,
        ),
        CTX,
        uow,
    )

    assert uow.shifts.rows["S1"].status == "closed"


async def test_rejects_closing_an_unknown_shift() -> None:
    with pytest.raises(DomainError) as err:
        await CloseShiftHandler(FakeCashiers({"U1"}))(
            CloseShift(
                shift_id="S9",
                closed_by="U1",
                counted_cash=0,
                expected_cash=0,
                variance=0,
                occurred_at=AT,
            ),
            CTX,
            FakeUnitOfWork(),
        )

    assert err.value.code == "SHIFT_NOT_FOUND"


async def test_records_a_cash_movement() -> None:
    uow = FakeUnitOfWork()
    await opened(uow)

    await MoveCashHandler(FakeCashiers({"U1"}))(
        MoveCash(
            movement_id="C1",
            shift_id="S1",
            type="out",
            amount=20_000,
            reason="Es batu",
            created_by="U1",
            occurred_at=AT,
        ),
        CTX,
        uow,
    )

    assert [m.amount for m in uow.shifts.movements] == [20_000]


async def test_rejects_a_shift_of_another_device() -> None:
    uow = FakeUnitOfWork()
    await opened(uow)
    other = DeviceContext(tenant_id="TN", device_id="D2", outlet_id="T1")

    with pytest.raises(DomainError) as err:
        await CloseShiftHandler(FakeCashiers({"U1"}))(
            CloseShift(
                shift_id="S1",
                closed_by="U1",
                counted_cash=0,
                expected_cash=200_000,
                variance=-200_000,
                occurred_at=AT,
            ),
            other,
            uow,
        )

    assert err.value.code == "SHIFT_NOT_FOUND"
