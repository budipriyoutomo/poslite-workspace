from datetime import UTC, date, datetime, time

from poslite.shared.domain.business_date import business_date

CUTOFF = time(4, 0)


def test_is_the_outlets_local_date_during_opening_hours() -> None:
    assert business_date(datetime(2026, 9, 25, 3, 0, tzinfo=UTC), "Asia/Jakarta", CUTOFF) == date(
        2026, 9, 25
    )


def test_uses_the_outlet_time_zone_not_utc() -> None:
    # 23:30 UTC = 06:30 WIB next day
    assert business_date(datetime(2026, 9, 25, 23, 30, tzinfo=UTC), "Asia/Jakarta", CUTOFF) == date(
        2026, 9, 26
    )


def test_counts_sales_before_the_cutoff_as_the_previous_day() -> None:
    # 02:30 WIB on the 26th
    assert business_date(datetime(2026, 9, 25, 19, 30, tzinfo=UTC), "Asia/Jakarta", CUTOFF) == date(
        2026, 9, 25
    )


def test_starts_the_new_day_exactly_at_the_cutoff() -> None:
    assert business_date(datetime(2026, 9, 25, 21, 0, tzinfo=UTC), "Asia/Jakarta", CUTOFF) == date(
        2026, 9, 26
    )
