"""Subscription rules (ADR-018): trial, monthly periods per active outlet, grace. Pure Python."""

import calendar
from datetime import date, datetime, timedelta

TRIAL_DAYS = 14
GRACE_DAYS = 7


def trial_end(signed_up_at: datetime) -> datetime:
    return signed_up_at + timedelta(days=TRIAL_DAYS)


def add_month(day: date) -> date:
    """Same day next month, clamped to the month's last day (Jan 31 → Feb 28)."""
    year, month = (day.year + 1, 1) if day.month == 12 else (day.year, day.month + 1)
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def due_period(
    status: str, *, trial_ends_at: datetime, period_end: date | None, now: datetime
) -> tuple[date, date] | None:
    """The period that needs an invoice now: after the trial, then after each paid period."""
    start = trial_ends_at.date() if status == "trialing" or period_end is None else period_end
    if now.date() < start:
        return None
    return start, add_month(start)


def invoice_amount(*, outlets: int, price_per_outlet: int) -> int:
    return outlets * price_per_outlet


def is_overdue(status: str, *, due_at: datetime, now: datetime) -> bool:
    return status == "open" and now > due_at
