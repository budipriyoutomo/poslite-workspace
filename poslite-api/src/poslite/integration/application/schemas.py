from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, Field, HttpUrl

EventType = Literal["order.placed", "shift.closed", "order.voided", "order.refunded"]


def _https(url: HttpUrl) -> HttpUrl:
    # Order data leaves our system: never in clear text, except to a developer's own machine.
    if url.scheme != "https" and url.host not in ("localhost", "127.0.0.1"):
        raise ValueError("webhook URL must use https")
    return url


Ulid = Annotated[str, Field(pattern=r"^[0-9A-HJKMNP-TV-Z]{26}$")]


class EndpointIn(BaseModel):
    url: Annotated[HttpUrl, AfterValidator(_https)]
    event_types: Annotated[list[EventType], Field(min_length=1)]
    brand_ids: list[Ulid] = Field(default=[], description="Only these brands; empty = all")


class EndpointOut(BaseModel):
    id: str
    url: str
    event_types: list[str]
    brand_ids: list[str]
    is_active: bool


class CreatedEndpointOut(EndpointOut):
    secret: str  # shown once


class DeliveryOut(BaseModel):
    id: str
    event_type: str
    status: str
    attempts: int
    last_status_code: int | None
    last_error: str | None
    created_at: datetime
    next_attempt_at: datetime
    delivered_at: datetime | None
