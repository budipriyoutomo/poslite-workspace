"""ADR-031: a table-service outlet keeps its open bills on the server. One device edits a bill at a
time (a 60-second lease); a save names the version it started from, and an older one loses."""

from datetime import UTC, datetime, timedelta

import pytest

from poslite.sales.domain.open_bills import LEASE, Lease, check_save, take_lease
from poslite.shared.domain.errors import DomainError

NOW = datetime(2026, 10, 24, 12, 0, tzinfo=UTC)
WAITER = Lease(device_id="D1", user_id="U1", until=NOW + timedelta(seconds=30))


def _code(err: pytest.ExceptionInfo[DomainError]) -> str:
    return err.value.code


def test_a_free_bill_is_leased_for_sixty_seconds() -> None:
    assert take_lease(None, device_id="D2", user_id="U2", now=NOW) == Lease("D2", "U2", NOW + LEASE)
    assert timedelta(seconds=60) == LEASE


def test_the_holder_renews_its_own_lease() -> None:
    renewed = take_lease(WAITER, device_id="D1", user_id="U3", now=NOW)

    assert renewed == Lease("D1", "U3", NOW + LEASE)


def test_another_device_cannot_take_a_live_lease() -> None:
    with pytest.raises(DomainError) as err:
        take_lease(WAITER, device_id="D2", user_id="U2", now=NOW)

    assert (_code(err), err.value.kind) == ("BILL_LEASED", "conflict")


def test_an_expired_lease_may_be_taken_by_another_device() -> None:
    expired = Lease("D1", "U1", NOW)

    assert take_lease(expired, device_id="D2", user_id="U2", now=NOW).device_id == "D2"


def test_a_save_from_the_version_on_the_server_is_allowed() -> None:
    check_save(version=3, sent_version=3, lease=WAITER, device_id="D1", now=NOW)
    check_save(version=3, sent_version=3, lease=None, device_id="D1", now=NOW)


def test_a_save_from_an_older_version_is_a_conflict() -> None:
    with pytest.raises(DomainError) as err:
        check_save(version=4, sent_version=3, lease=WAITER, device_id="D1", now=NOW)

    assert (_code(err), err.value.kind) == ("BILL_VERSION_CONFLICT", "conflict")


def test_a_lost_edit_is_a_conflict_even_while_another_device_holds_the_lease() -> None:
    with pytest.raises(DomainError) as err:
        check_save(version=4, sent_version=3, lease=WAITER, device_id="D2", now=NOW)

    assert _code(err) == "BILL_VERSION_CONFLICT"


def test_a_save_while_another_device_holds_the_lease_is_refused() -> None:
    with pytest.raises(DomainError) as err:
        check_save(version=3, sent_version=3, lease=WAITER, device_id="D2", now=NOW)

    assert _code(err) == "BILL_LEASED"


def test_a_device_back_online_saves_over_its_own_expired_lease() -> None:
    """Offline edits of a bill nobody else touched are kept (ADR-031 rule 4)."""
    expired = Lease("D1", "U1", NOW - timedelta(minutes=10))

    check_save(version=3, sent_version=3, lease=expired, device_id="D1", now=NOW)
    check_save(version=3, sent_version=3, lease=expired, device_id="D2", now=NOW)
