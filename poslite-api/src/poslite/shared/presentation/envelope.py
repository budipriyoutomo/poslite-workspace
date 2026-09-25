from pydantic import BaseModel


class ApiResponse[T](BaseModel):
    """Success envelope (07-api-contract.md): {"data": …, "message": "OK", "meta": {}}."""

    data: T
    message: str = "OK"
    meta: dict[str, object] = {}


def ok[T](data: T, message: str = "OK") -> ApiResponse[T]:
    return ApiResponse[T](data=data, message=message)
