from typing import Annotated
from zoneinfo import available_timezones

from pydantic import AfterValidator, StringConstraints

# No email-validator dependency: a pragmatic shape check; the real proof is the login itself.
Email = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, to_lower=True, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
    ),
]
Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


def _timezone(value: str) -> str:
    if value not in available_timezones():
        raise ValueError(f"unknown time zone {value}")
    return value


TimeZone = Annotated[str, AfterValidator(_timezone)]
