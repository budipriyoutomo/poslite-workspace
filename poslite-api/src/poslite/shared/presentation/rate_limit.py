"""Rate limits of the public, credential-taking endpoints (ADR-027)."""

import hashlib

from fastapi import Request

from poslite.shared.application.rate_limit import RateLimit, RateLimiter
from poslite.shared.domain.errors import RateLimitedError

SIGNUP = RateLimit("signup-ip", limit=5, window_seconds=3600)
LOGIN_IP = RateLimit("login-ip", limit=30, window_seconds=300)
LOGIN_EMAIL = RateLimit("login-email", limit=10, window_seconds=900)
ACTIVATE_IP = RateLimit("activate-ip", limit=30, window_seconds=300)
ACTIVATE_EMAIL = RateLimit("activate-email", limit=10, window_seconds=900)
OPERATOR_LOGIN_IP = RateLimit("operator-login-ip", limit=10, window_seconds=300)
OPERATOR_LOGIN_EMAIL = RateLimit("operator-login-email", limit=5, window_seconds=900)
OPERATOR_2FA_IP = RateLimit("operator-2fa-ip", limit=10, window_seconds=300)  # P1-8


def client_address(request: Request) -> str:
    # Behind Caddy, gunicorn --forwarded-allow-ips rewrites request.client from X-Forwarded-For.
    return request.client.host if request.client else "unknown"


def email_subject(email: str) -> str:
    """Emails are hashed: rate-limit keys must not store personal data in Redis."""
    return hashlib.sha256(email.strip().lower().encode()).hexdigest()[:32]


async def enforce(request: Request, *checks: tuple[RateLimit, str]) -> None:
    """Count every check (so one subject cannot hide behind another), then refuse if any is over."""
    limiter: RateLimiter = request.app.state.rate_limiter
    waits = [await limiter.hit(rule, subject) for rule, subject in checks]
    blocked = [w for w in waits if w is not None]
    if blocked:
        raise RateLimitedError(max(blocked))
