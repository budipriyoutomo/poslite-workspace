"""Fixed-window rate limiters (ADR-027): Redis across API workers, memory for dev and tests."""

import logging
from collections.abc import Awaitable, Callable

from redis.asyncio import Redis
from redis.exceptions import RedisError

from poslite.shared.application.clock import Clock
from poslite.shared.application.rate_limit import RateLimit, RateLimiter
from poslite.shared.config import Settings

logger = logging.getLogger(__name__)


def _window(rule: RateLimit, epoch: int) -> tuple[int, int]:
    """Index of the window `epoch` falls in, and seconds left in it."""
    index = epoch // rule.window_seconds
    return index, (index + 1) * rule.window_seconds - epoch


class InMemoryRateLimiter:
    """One process only: right for dev and tests, not for several gunicorn workers."""

    def __init__(self, clock: Clock) -> None:
        self._clock = clock
        self._counts: dict[tuple[str, str, int], int] = {}

    async def hit(self, rule: RateLimit, subject: str) -> int | None:
        index, remaining = _window(rule, int(self._clock.now().timestamp()))
        key = (rule.name, subject, index)
        # Old windows are never read again; drop them so the dict stays small.
        self._counts = {k: v for k, v in self._counts.items() if k[2] >= index or k[0] != rule.name}
        self._counts[key] = self._counts.get(key, 0) + 1
        return None if self._counts[key] <= rule.limit else remaining


class RedisRateLimiter:
    """Shared by every API worker. Fails open: a Redis outage must not lock owners out."""

    def __init__(self, redis: Redis, clock: Clock) -> None:
        self._redis, self._clock = redis, clock

    async def hit(self, rule: RateLimit, subject: str) -> int | None:
        index, remaining = _window(rule, int(self._clock.now().timestamp()))
        key = f"rl:{rule.name}:{subject}:{index}"
        try:
            async with self._redis.pipeline(transaction=True) as pipe:
                pipe.incr(key)
                pipe.expire(key, rule.window_seconds + 1)
                count, _ = await pipe.execute()
        except RedisError:
            logger.warning("rate limiter unavailable; allowing %s", rule.name)
            return None
        return None if int(count) <= rule.limit else remaining


async def _nothing() -> None:
    return None


def build_rate_limiter(
    settings: Settings, clock: Clock
) -> tuple[RateLimiter, Callable[[], Awaitable[None]]]:
    """The limiter for the app's lifespan and how to release it on shutdown."""
    if settings.rate_limit_backend == "redis":
        redis = Redis.from_url(settings.redis_url, socket_timeout=0.5, socket_connect_timeout=0.5)
        return RedisRateLimiter(redis, clock), redis.aclose
    return InMemoryRateLimiter(clock), _nothing
