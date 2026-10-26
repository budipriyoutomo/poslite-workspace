from datetime import UTC, date, datetime

import pytest

from poslite.shared.domain.errors import DomainError
from poslite.shift.domain.entities import CashMovement, Shift
from poslite.shift.domain.events import ShiftClosed, ShiftOpened

OPENED = datetime(2026, 9, 25, 1, 0, tzinfo=UTC)
CLOSED = datetime(2026, 9, 25, 14, 0, tzinfo=UTC)


def open_shift() -> Shift:
    return Shift.open(
        shift_id="S1",
        outlet_id="T1",
        device_id="D1",
        opened_by="U1",
        opened_at=OPENED,
        opening_cash=200_000,
        business_date=date(2026, 9, 25),
    )


def test_opening_records_the_opening_cash_and_an_event() -> None:
    shift = open_shift()

    assert (shift.status, shift.opening_cash) == ("open", 200_000)
    assert [type(e) for e in shift.events] == [ShiftOpened]


def test_closing_records_counted_cash_and_variance() -> None:
    shift = open_shift()

    shift.close(
        closed_by="U1",
        closed_at=CLOSED,
        counted_cash=330_000,
        expected_cash=337_500,
        variance=-7_500,
    )

    assert (shift.status, shift.variance) == ("closed", -7_500)
    assert isinstance(shift.events[-1], ShiftClosed)


def test_rejects_a_variance_that_does_not_match_counted_minus_expected() -> None:
    with pytest.raises(DomainError) as err:
        open_shift().close(
            closed_by="U1",
            closed_at=CLOSED,
            counted_cash=330_000,
            expected_cash=337_500,
            variance=0,
        )

    assert err.value.code == "VARIANCE_MISMATCH"


def test_cannot_close_twice() -> None:
    shift = open_shift()
    shift.close(closed_by="U1", closed_at=CLOSED, counted_cash=0, expected_cash=0, variance=0)

    with pytest.raises(DomainError) as err:
        shift.close(closed_by="U1", closed_at=CLOSED, counted_cash=0, expected_cash=0, variance=0)

    assert err.value.code == "SHIFT_ALREADY_CLOSED"


def test_cash_moves_only_on_an_open_shift() -> None:
    shift = open_shift()
    movement = CashMovement.record(
        movement_id="C1",
        shift=shift,
        type="out",
        amount=20_000,
        reason="Beli es batu",
        created_by="U1",
        created_at=OPENED,
    )
    shift.close(closed_by="U1", closed_at=CLOSED, counted_cash=0, expected_cash=0, variance=0)

    assert movement.amount == 20_000
    with pytest.raises(DomainError) as err:
        CashMovement.record(
            movement_id="C2",
            shift=shift,
            type="in",
            amount=1_000,
            reason="x",
            created_by="U1",
            created_at=CLOSED,
        )
    assert err.value.code == "SHIFT_CLOSED"


def test_rejects_a_non_positive_cash_movement() -> None:
    with pytest.raises(DomainError) as err:
        CashMovement.record(
            movement_id="C1",
            shift=open_shift(),
            type="in",
            amount=0,
            reason="x",
            created_by="U1",
            created_at=OPENED,
        )

    assert err.value.code == "INVALID_AMOUNT"


def test_closing_keeps_the_count_per_denomination() -> None:
    shift = open_shift()

    shift.close(
        closed_by="U1",
        closed_at=CLOSED,
        counted_cash=330_000,
        expected_cash=337_500,
        variance=-7_500,
        denominations={100_000: 3, 20_000: 1, 5_000: 2, 1: 0},
    )

    assert shift.denominations == {100_000: 3, 20_000: 1, 5_000: 2, 1: 0}


def test_counts_coins_as_their_total_under_denomination_one() -> None:
    shift = open_shift()

    shift.close(
        closed_by="U1",
        closed_at=CLOSED,
        counted_cash=101_500,
        expected_cash=101_500,
        variance=0,
        denominations={100_000: 1, 1: 1_500},
    )

    assert shift.denominations == {100_000: 1, 1: 1_500}


def test_rejects_denominations_that_do_not_add_up_to_the_counted_cash() -> None:
    with pytest.raises(DomainError) as err:
        open_shift().close(
            closed_by="U1",
            closed_at=CLOSED,
            counted_cash=330_000,
            expected_cash=337_500,
            variance=-7_500,
            denominations={100_000: 3},
        )

    assert err.value.code == "DENOMINATIONS_MISMATCH"


def test_closing_without_denominations_keeps_none() -> None:
    shift = open_shift()

    shift.close(closed_by="U1", closed_at=CLOSED, counted_cash=0, expected_cash=0, variance=0)

    assert shift.denominations is None
