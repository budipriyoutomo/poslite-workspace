from datetime import UTC, date, datetime

import pytest

from poslite.billing.domain.rules import (
    GRACE_DAYS,
    TRIAL_DAYS,
    add_month,
    due_period,
    invoice_amount,
    is_overdue,
    trial_end,
)

T = datetime(2026, 9, 27, 3, 0, tzinfo=UTC)


def test_a_trial_lasts_14_days_from_signup() -> None:
    assert TRIAL_DAYS == 14
    assert trial_end(datetime(2026, 9, 1, 10, 0, tzinfo=UTC)) == datetime(
        2026, 9, 15, 10, 0, tzinfo=UTC
    )


@pytest.mark.parametrize(
    ("start", "end"),
    [
        (date(2026, 9, 15), date(2026, 10, 15)),
        (date(2026, 1, 31), date(2026, 2, 28)),
        (date(2026, 12, 20), date(2027, 1, 20)),
    ],
)
def test_a_period_is_one_calendar_month(start: date, end: date) -> None:
    assert add_month(start) == end


def test_the_first_period_starts_when_the_trial_ends() -> None:
    assert due_period(
        "trialing", trial_ends_at=datetime(2026, 9, 15, 10, tzinfo=UTC), period_end=None, now=T
    ) == (
        date(2026, 9, 15),
        date(2026, 10, 15),
    )


def test_nothing_is_due_during_the_trial() -> None:
    assert (
        due_period(
            "trialing", trial_ends_at=datetime(2026, 10, 1, tzinfo=UTC), period_end=None, now=T
        )
        is None
    )


def test_the_next_period_starts_when_the_paid_one_ends() -> None:
    assert due_period("active", trial_ends_at=T, period_end=date(2026, 9, 27), now=T) == (
        date(2026, 9, 27),
        date(2026, 10, 27),
    )
    assert due_period("active", trial_ends_at=T, period_end=date(2026, 10, 27), now=T) is None


def test_the_bill_is_outlets_times_the_price() -> None:
    assert invoice_amount(outlets=3, price_per_outlet=150_000) == 450_000


def test_an_invoice_is_overdue_after_the_grace_days() -> None:
    assert GRACE_DAYS == 7
    due = datetime(2026, 9, 22, tzinfo=UTC)
    assert not is_overdue("open", due_at=due, now=datetime(2026, 9, 22, tzinfo=UTC))
    assert is_overdue("open", due_at=due, now=datetime(2026, 9, 22, 0, 1, tzinfo=UTC))
    assert not is_overdue("paid", due_at=due, now=T)
