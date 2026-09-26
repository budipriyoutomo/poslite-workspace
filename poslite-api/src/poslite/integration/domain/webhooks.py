"""Outgoing webhook rules (ADR-020): signature and retry schedule. Pure Python."""

import hashlib
import hmac
from datetime import timedelta

# Delay before attempt n + 1 after n failures; after the last attempt the delivery is dead.
_BACKOFF = (
    timedelta(minutes=1),
    timedelta(minutes=5),
    timedelta(minutes=15),
    timedelta(hours=1),
    timedelta(hours=3),
    timedelta(hours=6),
    timedelta(hours=12),
)
MAX_ATTEMPTS = len(_BACKOFF) + 1


def sign(secret: str, timestamp: int, body: bytes) -> str:
    """`t=<unix>,v1=<hex hmac-sha256 of "<t>.<body>">` — the timestamp stops replays."""
    digest = hmac.new(secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha256)
    return f"t={timestamp},v1={digest.hexdigest()}"


def next_retry_delay(attempts: int) -> timedelta | None:
    """Wait after `attempts` failed sends, or None when the delivery should give up."""
    if attempts >= MAX_ATTEMPTS:
        return None
    return _BACKOFF[attempts - 1]
