"""ADR-022: back-office access to brands and outlets, computed from a user's assignments."""

from poslite.identity.domain.access import AccessScope
from poslite.identity.domain.assignments import Assignment


def scope(*assignments: Assignment) -> AccessScope:
    return AccessScope.of(list(assignments))


OWNER = Assignment(role="owner", scope_type="company", brand_id=None, outlet_id=None)
COMPANY_MANAGER = Assignment(role="manager", scope_type="company", brand_id=None, outlet_id=None)
BRAND_A_MANAGER = Assignment(role="manager", scope_type="brand", brand_id="BA", outlet_id=None)
OUTLET_A1_MANAGER = Assignment(role="manager", scope_type="outlet", brand_id="BA", outlet_id="A1")
OUTLET_A1_CASHIER = Assignment(role="cashier", scope_type="outlet", brand_id="BA", outlet_id="A1")
BRAND_B_CASHIER = Assignment(role="cashier", scope_type="brand", brand_id="BB", outlet_id=None)


def test_owner_and_company_manager_reach_every_brand_and_outlet() -> None:
    for access in (scope(OWNER), scope(COMPANY_MANAGER)):
        assert access.company
        assert access.can_manage_brand("BZ")
        assert access.can_access_outlet(outlet_id="Z1", brand_id="BZ")


def test_brand_manager_manages_only_that_brand_and_its_outlets() -> None:
    access = scope(BRAND_A_MANAGER)

    assert not access.company
    assert access.can_manage_brand("BA")
    assert not access.can_read_brand("BB")
    assert access.can_access_outlet(outlet_id="A7", brand_id="BA")
    assert not access.can_access_outlet(outlet_id="B1", brand_id="BB")


def test_outlet_manager_reads_the_brand_menu_but_cannot_change_it() -> None:
    access = scope(OUTLET_A1_MANAGER)

    assert access.can_read_brand("BA")
    assert not access.can_manage_brand("BA")
    assert access.can_access_outlet(outlet_id="A1", brand_id="BA")
    assert not access.can_access_outlet(outlet_id="A2", brand_id="BA")


def test_cashier_assignments_give_no_back_office_access() -> None:
    access = scope(OUTLET_A1_CASHIER, BRAND_B_CASHIER)

    assert not access.can_read_brand("BA")
    assert not access.can_read_brand("BB")
    assert not access.can_access_outlet(outlet_id="A1", brand_id="BA")


def test_brand_role_is_the_highest_brand_or_company_role() -> None:
    assert scope(OWNER).brand_role("BA") == "owner"
    assert scope(BRAND_A_MANAGER, OUTLET_A1_MANAGER).brand_role("BA") == "manager"
    assert scope(OUTLET_A1_MANAGER).brand_role("BA") is None


def test_outlet_role_is_the_highest_back_office_role_covering_the_outlet() -> None:
    access = scope(OUTLET_A1_CASHIER, OUTLET_A1_MANAGER)

    assert access.outlet_role(outlet_id="A1", brand_id="BA") == "manager"
    assert access.outlet_role(outlet_id="A2", brand_id="BA") is None
