from typing import ClassVar


class DomainEvent:
    """Something that happened in a module. Written to the outbox on commit (ADR-012)."""

    topic: ClassVar[str]

    def to_payload(self) -> dict[str, object]:
        raise NotImplementedError
