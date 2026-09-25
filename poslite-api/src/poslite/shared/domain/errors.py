from typing import Literal

ErrorKind = Literal["invalid", "unauthorized", "forbidden", "not_found", "conflict"]


class DomainError(Exception):
    """Expected business failure with a stable machine `code` (mapped to HTTP in presentation)."""

    def __init__(
        self, code: str, message: str | None = None, *, kind: ErrorKind = "invalid"
    ) -> None:
        super().__init__(message or code)
        self.code = code
        self.kind = kind
