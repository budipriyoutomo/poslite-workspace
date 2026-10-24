from dataclasses import dataclass
from typing import Literal

from poslite.identity.domain.roles import RANK, Role
from poslite.shared.domain.errors import DomainError

ScopeType = Literal["company", "brand", "outlet"]


@dataclass(frozen=True, slots=True)
class Assignment:
    """A role over part of the company (ADR-022): all of it, one brand, or one outlet."""

    role: Role
    scope_type: ScopeType
    brand_id: str | None
    outlet_id: str | None

    def covers(self, *, outlet_id: str, brand_id: str) -> bool:
        if self.scope_type == "company":
            return True
        if self.scope_type == "brand":
            return self.brand_id == brand_id
        return self.outlet_id == outlet_id


def check_assignment(a: Assignment) -> None:
    """Scope rules (doc 10): owners are company-wide, cashiers and waiters are not; a brand scope
    names a brand, an outlet scope names an outlet and its brand. Mirrors the table's CHECK
    constraints."""
    shape_ok = {
        "company": a.brand_id is None and a.outlet_id is None,
        "brand": a.brand_id is not None and a.outlet_id is None,
        "outlet": a.brand_id is not None and a.outlet_id is not None,
    }[a.scope_type]
    if not shape_ok:
        raise DomainError("INVALID_ASSIGNMENT", f"A {a.scope_type} scope has the wrong ids")
    if a.role == "owner" and a.scope_type != "company":
        raise DomainError("INVALID_ASSIGNMENT", "An owner is always company-wide")
    if a.role in ("cashier", "waiter") and a.scope_type == "company":
        raise DomainError("INVALID_ASSIGNMENT", f"A {a.role} works at a brand or an outlet")


def role_at_outlet(assignments: list[Assignment], *, outlet_id: str, brand_id: str) -> Role | None:
    """Highest role among the assignments that cover the outlet; None = no access there."""
    roles = [a.role for a in assignments if a.covers(outlet_id=outlet_id, brand_id=brand_id)]
    return max(roles, key=RANK.__getitem__, default=None)


def highest_role(assignments: list[Assignment]) -> Role:
    return max((a.role for a in assignments), key=RANK.__getitem__, default="cashier")


# Until the assignment editor exists (Fase 6a), the back-office sends and shows roles per outlet.


def from_outlet_roles(roles: list[tuple[str, str, Role]]) -> list[Assignment]:
    """(outlet_id, brand_id, role) rows → assignments. An owner is company-wide, so an owner row
    anywhere makes the user one company owner and their other rows are redundant."""
    if any(role == "owner" for _, _, role in roles):
        return [Assignment(role="owner", scope_type="company", brand_id=None, outlet_id=None)]
    return [
        Assignment(role=role, scope_type="outlet", brand_id=brand_id, outlet_id=outlet_id)
        for outlet_id, brand_id, role in roles
    ]


def outlet_roles(
    assignments: list[Assignment], outlets: list[tuple[str, str]]
) -> list[tuple[str, Role]]:
    """The role at each (outlet_id, brand_id) the assignments cover, in the order given."""
    result: list[tuple[str, Role]] = []
    for outlet_id, brand_id in outlets:
        role = role_at_outlet(assignments, outlet_id=outlet_id, brand_id=brand_id)
        if role is not None:
            result.append((outlet_id, role))
    return result
