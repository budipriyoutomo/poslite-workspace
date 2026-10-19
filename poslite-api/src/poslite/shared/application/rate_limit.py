"""Rate limiting of public, credential-taking endpoints (ADR-027)."""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class RateLimit:
    """At most `limit` attempts per subject in each fixed window of `window_seconds`."""

    name: str
    limit: int
    window_seconds: int


class RateLimiter(Protocol):
    async def hit(self, rule: RateLimit, subject: str) -> int | None:
        """Count one attempt. None = allowed; otherwise seconds until the window resets."""
        ...
