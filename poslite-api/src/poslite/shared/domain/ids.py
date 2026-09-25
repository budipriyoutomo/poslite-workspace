import re

from ulid import ULID

ULID_PATTERN = re.compile(r"^[0-9A-HJKMNP-TV-Z]{26}$")


def new_ulid() -> str:
    return str(ULID())


def is_ulid(value: str) -> bool:
    return bool(ULID_PATTERN.match(value))
