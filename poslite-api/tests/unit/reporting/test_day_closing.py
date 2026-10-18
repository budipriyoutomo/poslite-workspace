from datetime import UTC, datetime

import pytest

from poslite.reporting.domain.day_closing import (
    CashSummary,
    DeviceSeen,
    ShiftCash,
    day_warnings,
    ensure_can_close,
)
from poslite.shared.domain.errors import DomainError

DAY_END = datetime(2026, 9, 25, 21, 0, tzinfo=UTC)


def device(code: str, last_seen_at: datetime | None) -> DeviceSeen:
    return DeviceSeen(id=f"dev-{code}", code=code, name=f"Kasir {code}", last_seen_at=last_seen_at)


def test_rejects_closing_a_day_that_has_not_ended() -> None:
    with pytest.raises(DomainError) as error:
        ensure_can_close(
            now=datetime(2026, 9, 25, 20, 59, tzinfo=UTC), day_end=DAY_END, closed=False
        )

    assert error.value.code == "DAY_NOT_ENDED"


def test_rejects_closing_a_day_twice() -> None:
    with pytest.raises(DomainError) as error:
        ensure_can_close(now=DAY_END, day_end=DAY_END, closed=True)

    assert (error.value.code, error.value.kind) == ("DAY_ALREADY_CLOSED", "conflict")


def test_allows_closing_from_the_cutoff_of_the_next_day() -> None:
    ensure_can_close(now=DAY_END, day_end=DAY_END, closed=False)


def test_has_no_warnings_when_every_shift_is_closed_and_every_device_synced_after_the_day() -> None:
    assert day_warnings(open_shift_count=0, devices=[device("A", DAY_END)], day_end=DAY_END) == []


def test_warns_about_open_shifts() -> None:
    assert day_warnings(open_shift_count=2, devices=[], day_end=DAY_END) == [
        {"code": "OPEN_SHIFTS", "count": 2}
    ]


def test_warns_about_devices_not_seen_since_the_day_ended() -> None:
    stale = datetime(2026, 9, 25, 14, 0, tzinfo=UTC)
    warnings = day_warnings(
        open_shift_count=0,
        devices=[device("A", DAY_END), device("B", stale), device("C", None)],
        day_end=DAY_END,
    )

    assert warnings == [
        {
            "code": "DEVICES_NOT_SYNCED",
            "devices": [
                {"id": "dev-B", "code": "B", "name": "Kasir B", "last_seen_at": stale.isoformat()},
                {"id": "dev-C", "code": "C", "name": "Kasir C", "last_seen_at": None},
            ],
        }
    ]


def test_cash_summary_counts_only_closed_shifts_in_expected_counted_and_variance() -> None:
    cash = CashSummary.of(
        [
            ShiftCash(
                status="closed",
                opening_cash=200_000,
                expected_cash=252_765,
                counted_cash=250_000,
                variance=-2_765,
            ),
            ShiftCash(status="open", opening_cash=100_000),
        ]
    )

    assert cash.as_dict() == {
        "shift_count": 2,
        "open_shift_count": 1,
        "opening_cash": 300_000,
        "expected_cash": 252_765,
        "counted_cash": 250_000,
        "variance": -2_765,
    }
