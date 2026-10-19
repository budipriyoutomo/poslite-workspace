from datetime import UTC, datetime, timedelta

from poslite.shared.application.rate_limit import RateLimit
from poslite.shared.infrastructure.rate_limit import InMemoryRateLimiter

LOGIN = RateLimit(name="login", limit=3, window_seconds=60)
T0 = datetime(2026, 10, 18, 3, 0, 0, tzinfo=UTC)


class StepClock:
    def __init__(self) -> None:
        self.at = T0

    def now(self) -> datetime:
        return self.at


async def test_allows_up_to_the_limit_within_a_window() -> None:
    limiter = InMemoryRateLimiter(StepClock())

    results = [await limiter.hit(LOGIN, "1.2.3.4") for _ in range(4)]

    assert [r is None for r in results] == [True, True, True, False]


async def test_says_how_long_until_the_window_resets() -> None:
    clock = StepClock()
    limiter = InMemoryRateLimiter(clock)
    for _ in range(3):
        await limiter.hit(LOGIN, "1.2.3.4")

    clock.at = T0 + timedelta(seconds=45)

    assert await limiter.hit(LOGIN, "1.2.3.4") == 15


async def test_a_new_window_starts_fresh() -> None:
    clock = StepClock()
    limiter = InMemoryRateLimiter(clock)
    for _ in range(4):
        await limiter.hit(LOGIN, "1.2.3.4")

    clock.at = T0 + timedelta(seconds=60)

    assert await limiter.hit(LOGIN, "1.2.3.4") is None


async def test_counts_each_subject_and_limit_separately() -> None:
    limiter = InMemoryRateLimiter(StepClock())
    for _ in range(3):
        await limiter.hit(LOGIN, "1.2.3.4")

    assert await limiter.hit(LOGIN, "5.6.7.8") is None
    assert await limiter.hit(RateLimit("signup", 3, 60), "1.2.3.4") is None
