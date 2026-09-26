from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True, slots=True)
class Change:
    """A master-data change for delta pull (07-api-contract.md); deletes carry no data."""

    entity: str
    op: Literal["upsert", "delete"]
    id: str
    version: int
    data: dict[str, object] | None


@dataclass(frozen=True, slots=True)
class DeviceContext:
    """The pushing device, resolved from its token (never from the payload)."""

    tenant_id: str
    device_id: str
    outlet_id: str


@dataclass(frozen=True, slots=True)
class EventOutcome:
    """Result of one pushed event; `flagged` is stored like `accepted` (07-api-contract.md)."""

    status: Literal["accepted", "flagged"]
    flags: tuple[str, ...] = ()

    @classmethod
    def of(cls, flags: tuple[str, ...]) -> "EventOutcome":
        return cls("flagged", flags) if flags else cls("accepted")
