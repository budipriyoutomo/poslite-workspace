from datetime import UTC, datetime

from redis.asyncio import Redis

from poslite.shared.application.rate_limit import RateLimit
from poslite.shared.infrastructure.rate_limit import RedisRateLimiter


class FixedClock:
    def now(self) -> datetime:
        return datetime(2026, 10, 18, 3, 0, tzinfo=UTC)


async def test_allows_the_attempt_when_redis_is_unreachable() -> None:
    """Fails open (ADR-027): a Redis outage must not lock every owner out of the back-office."""
    redis = Redis.from_url("redis://127.0.0.1:1/0", socket_connect_timeout=0.2)
    limiter = RedisRateLimiter(redis, FixedClock())

    assert await limiter.hit(RateLimit("login-ip", 1, 60), "1.2.3.4") is None
    await redis.aclose()
