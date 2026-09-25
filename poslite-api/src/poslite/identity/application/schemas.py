from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

from poslite.shared.presentation.schemas import Email, Name, Password, Ulid

Pin = Annotated[str, StringConstraints(pattern=r"^\d{4,6}$")]


class OutletRole(BaseModel):
    outlet_id: Ulid
    role: Literal["owner", "manager", "cashier"]


class UserIn(BaseModel):
    name: Name
    email: Email | None = None
    password: Password | None = None
    pin: Pin | None = None
    outlets: Annotated[list[OutletRole], Field(min_length=1)]


class PinIn(BaseModel):
    pin: Pin


class UserOut(BaseModel):
    id: str
    name: str
    email: str | None
    has_pin: bool
    outlets: list[OutletRole]
