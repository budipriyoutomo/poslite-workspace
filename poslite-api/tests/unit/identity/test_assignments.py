"""ADR-022: a user's role at an outlet comes from the assignments that cover it."""

import pytest

from poslite.identity.domain.assignments import (
    Assignment,
    check_assignment,
    from_outlet_roles,
    highest_role,
    outlet_roles,
    role_at_outlet,
)
from poslite.shared.domain.errors import DomainError

COMPANY_OWNER = Assignment(role="owner", scope_type="company", brand_id=None, outlet_id=None)
BRAND_A_MANAGER = Assignment(role="manager", scope_type="brand", brand_id="BA", outlet_id=None)
OUTLET_A1_CASHIER = Assignment(role="cashier", scope_type="outlet", brand_id="BA", outlet_id="A1")
BRAND_B_CASHIER = Assignment(role="cashier", scope_type="brand", brand_id="BB", outlet_id=None)


def test_company_scope_covers_every_outlet_of_every_brand() -> None:
    assert role_at_outlet([COMPANY_OWNER], outlet_id="B9", brand_id="BB") == "owner"


def test_brand_scope_covers_only_outlets_of_that_brand() -> None:
    assert role_at_outlet([BRAND_A_MANAGER], outlet_id="A2", brand_id="BA") == "manager"
    assert role_at_outlet([BRAND_A_MANAGER], outlet_id="B1", brand_id="BB") is None


def test_outlet_scope_covers_only_that_outlet() -> None:
    assert role_at_outlet([OUTLET_A1_CASHIER], outlet_id="A1", brand_id="BA") == "cashier"
    assert role_at_outlet([OUTLET_A1_CASHIER], outlet_id="A2", brand_id="BA") is None


def test_the_highest_covering_role_applies() -> None:
    assignments = [OUTLET_A1_CASHIER, BRAND_A_MANAGER]

    assert role_at_outlet(assignments, outlet_id="A1", brand_id="BA") == "manager"


@pytest.mark.parametrize(
    ("assignments", "expected"),
    [
        ([], "cashier"),
        ([OUTLET_A1_CASHIER], "cashier"),
        ([OUTLET_A1_CASHIER, BRAND_A_MANAGER], "manager"),
        ([BRAND_A_MANAGER, COMPANY_OWNER], "owner"),
    ],
)
def test_highest_role_over_all_assignments(assignments: list[Assignment], expected: str) -> None:
    assert highest_role(assignments) == expected


def test_outlet_roles_become_outlet_assignments() -> None:
    assignments = from_outlet_roles([("A1", "BA", "cashier"), ("B1", "BB", "manager")])

    assert assignments == [
        OUTLET_A1_CASHIER,
        Assignment(role="manager", scope_type="outlet", brand_id="BB", outlet_id="B1"),
    ]


def test_an_owner_row_anywhere_makes_one_company_wide_owner() -> None:
    roles = from_outlet_roles(
        [("A1", "BA", "owner"), ("A2", "BA", "owner"), ("B1", "BB", "cashier")]
    )

    assert roles == [COMPANY_OWNER]


def test_outlet_roles_list_every_outlet_an_assignment_covers() -> None:
    outlets = [("A1", "BA"), ("A2", "BA"), ("B1", "BB")]

    assert outlet_roles([BRAND_A_MANAGER, OUTLET_A1_CASHIER], outlets) == [
        ("A1", "manager"),
        ("A2", "manager"),
    ]
    assert outlet_roles([COMPANY_OWNER], outlets) == [
        ("A1", "owner"),
        ("A2", "owner"),
        ("B1", "owner"),
    ]


@pytest.mark.parametrize(
    "assignment",
    [
        Assignment(role="owner", scope_type="brand", brand_id="BA", outlet_id=None),
        Assignment(role="owner", scope_type="outlet", brand_id="BA", outlet_id="A1"),
        Assignment(role="cashier", scope_type="company", brand_id=None, outlet_id=None),
        Assignment(role="manager", scope_type="company", brand_id="BA", outlet_id=None),
        Assignment(role="manager", scope_type="brand", brand_id=None, outlet_id=None),
        Assignment(role="manager", scope_type="brand", brand_id="BA", outlet_id="A1"),
        Assignment(role="manager", scope_type="outlet", brand_id="BA", outlet_id=None),
    ],
)
def test_rejects_assignments_that_break_the_scope_rules(assignment: Assignment) -> None:
    with pytest.raises(DomainError) as error:
        check_assignment(assignment)

    assert error.value.code == "INVALID_ASSIGNMENT"


@pytest.mark.parametrize(
    "assignment", [COMPANY_OWNER, BRAND_A_MANAGER, OUTLET_A1_CASHIER, BRAND_B_CASHIER]
)
def test_accepts_assignments_that_follow_the_scope_rules(assignment: Assignment) -> None:
    check_assignment(assignment)
