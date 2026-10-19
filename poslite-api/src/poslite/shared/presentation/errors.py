from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from poslite.shared.domain.errors import DomainError, ErrorKind, RateLimitedError

STATUS: dict[ErrorKind, int] = {
    "invalid": 422,
    "unauthorized": 401,
    "forbidden": 403,
    "not_found": 404,
    "conflict": 409,
    "rate_limited": 429,
}


def _error(
    status: int, code: str, message: str, errors: dict[str, list[str]] | None = None
) -> JSONResponse:
    body: dict[str, object] = {"message": message, "code": code}
    if errors is not None:
        body["errors"] = errors
    return JSONResponse(status_code=status, content=body)


def install_error_handlers(app: FastAPI) -> None:
    """Error envelope (07-api-contract.md): {"message", "code", "errors"?}."""

    @app.exception_handler(DomainError)
    async def domain_error(_: Request, exc: DomainError) -> JSONResponse:
        response = _error(STATUS[exc.kind], exc.code, str(exc))
        if isinstance(exc, RateLimitedError):
            response.headers["Retry-After"] = str(exc.retry_after)
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors: dict[str, list[str]] = {}
        for err in exc.errors():
            field = ".".join(str(p) for p in err["loc"] if p != "body") or "body"
            errors.setdefault(field, []).append(str(err["msg"]))
        return _error(422, "VALIDATION_ERROR", "Validation failed", errors)
