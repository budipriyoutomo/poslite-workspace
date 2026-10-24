"""Shared open bills of a table-service outlet (ADR-031): one device edits a bill at a time, and a
save from an older version loses. Changes are never merged automatically."""

from dataclasses import dataclass
from datetime import datetime, timedelta

from poslite.shared.domain.errors import DomainError

# Renewed by the device while the bill is on its screen.
LEASE = timedelta(seconds=60)


@dataclass(frozen=True, slots=True)
class Lease:
    device_id: str
    user_id: str
    until: datetime

    def blocks(self, device_id: str, now: datetime) -> bool:
        """Another device still holds it; an expired lease blocks nobody."""
        return self.device_id != device_id and self.until > now


def _leased() -> DomainError:
    return DomainError("BILL_LEASED", "Another device is editing this bill", kind="conflict")


def take_lease(current: Lease | None, *, device_id: str, user_id: str, now: datetime) -> Lease:
    """Takes a free or expired lease, or renews this device's own."""
    if current is not None and current.blocks(device_id, now):
        raise _leased()
    return Lease(device_id, user_id, now + LEASE)


def check_save(
    *, version: int, sent_version: int, lease: Lease | None, device_id: str, now: datetime
) -> None:
    """A device saves over the version it loaded, unless another device is editing right now. A
    device back online after its lease expired still saves if nobody changed the bill since."""
    if sent_version != version:  # first: the device's edits are lost either way
        raise DomainError(
            "BILL_VERSION_CONFLICT", "The bill changed on another device", kind="conflict"
        )
    if lease is not None and lease.blocks(device_id, now):
        raise _leased()
