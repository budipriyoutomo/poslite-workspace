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
