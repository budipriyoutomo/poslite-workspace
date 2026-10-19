from typing import Literal

ErrorKind = Literal["invalid", "unauthorized", "forbidden", "not_found", "conflict", "rate_limited"]


class DomainError(Exception):
    """Expected business failure with a stable machine `code` (mapped to HTTP in presentation)."""

    def __init__(
        self, code: str, message: str | None = None, *, kind: ErrorKind = "invalid"
    ) -> None:
        super().__init__(message or code)
        self.code = code
        self.kind = kind


class RateLimitedError(DomainError):
    """Too many attempts (ADR-027); `retry_after` seconds until the window resets."""

    def __init__(self, retry_after: int) -> None:
        super().__init__("RATE_LIMITED", "Too many attempts, try again later", kind="rate_limited")
        self.retry_after = retry_after
