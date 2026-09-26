from dataclasses import dataclass

from poslite.shared.domain.events import DomainEvent


@dataclass(frozen=True, slots=True)
class ShiftOpened(DomainEvent):
    shift_id: str
    outlet_id: str
    business_date: str

    topic = "shift.opened"

    def to_payload(self) -> dict[str, object]:
        return {
            "shift_id": self.shift_id,
            "outlet_id": self.outlet_id,
            "business_date": self.business_date,
        }


@dataclass(frozen=True, slots=True)
class ShiftClosed(DomainEvent):
    shift_id: str
    outlet_id: str
    business_date: str
    variance: int

    topic = "shift.closed"

    def to_payload(self) -> dict[str, object]:
        return {
            "shift_id": self.shift_id,
            "outlet_id": self.outlet_id,
            "business_date": self.business_date,
            "variance": self.variance,
        }
