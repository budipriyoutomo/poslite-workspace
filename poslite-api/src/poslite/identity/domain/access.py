from dataclasses import dataclass

from poslite.identity.domain.assignments import Assignment, role_at_outlet
from poslite.identity.domain.roles import RANK, Role

BACKOFFICE_ROLES: frozenset[Role] = frozenset({"owner", "manager"})


@dataclass(frozen=True, slots=True)
class AccessScope:
    """What a back-office user may see and change inside their company (ADR-022).

    Company isolation is RLS; this is the second, application-level fence for brands and outlets.
    Only owner and manager assignments count: cashiers work on devices, not in the back-office.
    A brand is managed (menu, promotions, outlets) with company or brand scope; an outlet-only
    manager reads their brand's menu and manages their outlet.
    """

    assignments: tuple[Assignment, ...]

    @classmethod
    def of(cls, assignments: list[Assignment]) -> "AccessScope":
        return cls(tuple(a for a in assignments if a.role in BACKOFFICE_ROLES))

    @property
    def company(self) -> bool:
        return any(a.scope_type == "company" for a in self.assignments)

    def brand_role(self, brand_id: str) -> Role | None:
        """Role over the whole brand (company or brand scope); None = no brand-wide role."""
        roles = [
            a.role
            for a in self.assignments
            if a.scope_type == "company" or (a.scope_type == "brand" and a.brand_id == brand_id)
        ]
        return max(roles, key=RANK.__getitem__, default=None)

    def can_manage_brand(self, brand_id: str) -> bool:
        return self.brand_role(brand_id) is not None

    def can_read_brand(self, brand_id: str) -> bool:
        return self.can_manage_brand(brand_id) or any(
            a.brand_id == brand_id for a in self.assignments
        )

    def can_access_outlet(self, *, outlet_id: str, brand_id: str) -> bool:
        return self.outlet_role(outlet_id=outlet_id, brand_id=brand_id) is not None

    def outlet_role(self, *, outlet_id: str, brand_id: str) -> Role | None:
        return role_at_outlet(list(self.assignments), outlet_id=outlet_id, brand_id=brand_id)
