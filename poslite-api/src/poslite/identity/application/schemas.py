from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, model_validator

from poslite.shared.presentation.schemas import Email, Name, Password, Ulid

Pin = Annotated[str, StringConstraints(pattern=r"^\d{4,6}$")]


class OutletRole(BaseModel):
    outlet_id: Ulid
    role: Literal["owner", "manager", "cashier", "waiter"]


class AssignmentIn(BaseModel):
    """`brand_id` of an outlet scope may be left out: it is the outlet's brand."""

    role: Literal["owner", "manager", "cashier", "waiter"]
    scope_type: Literal["company", "brand", "outlet"]
    brand_id: Ulid | None = None
    outlet_id: Ulid | None = None


class AssignmentsIn(BaseModel):
    assignments: list[AssignmentIn]


class AssignmentOut(BaseModel):
    role: Literal["owner", "manager", "cashier", "waiter"]
    scope_type: Literal["company", "brand", "outlet"]
    brand_id: str | None
    outlet_id: str | None


LEGACY_OUTLETS = "Deprecated (before ADR-022): roles per outlet. Use `assignments`."


class UserIn(BaseModel):
    """Roles as `assignments` (ADR-022), or the older per-outlet `outlets`; exactly one of them."""

    name: Name
    email: Email | None = None
    password: Password | None = None
    pin: Pin | None = None
    assignments: list[AssignmentIn] = []
    outlets: list[OutletRole] = Field(default=[], description=LEGACY_OUTLETS)

    @model_validator(mode="after")
    def _one_kind_of_roles(self) -> "UserIn":
        if bool(self.assignments) == bool(self.outlets):
            raise ValueError("give the user's roles as either `assignments` or `outlets`")
        return self


class PinIn(BaseModel):
    pin: Pin


class UserUpdate(BaseModel):
    """Without `outlets` the roles stay as they are (change them at /users/{id}/assignments)."""

    name: Name
    is_active: bool = True
    outlets: list[OutletRole] | None = Field(default=None, description=LEGACY_OUTLETS)


class UserOut(BaseModel):
    id: str
    name: str
    email: str | None
    has_pin: bool
    is_active: bool
    assignments: list[AssignmentOut]
    outlets: list[OutletRole] = Field(description="Role at every outlet the assignments cover")
