from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo


def business_date(at: datetime, timezone: str, cutoff: time) -> date:
    """Outlet operational date: local date in its time zone; before `cutoff` = previous day.

    Same rule as the device's businessDate() (poslite-web features/shift/domain/business-date.ts).
    """
    local = at.astimezone(ZoneInfo(timezone))
    return local.date() - timedelta(days=1) if local.time() < cutoff else local.date()
