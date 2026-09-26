from dataclasses import dataclass

from poslite.shared.domain.events import DomainEvent


@dataclass(frozen=True, slots=True)
class OrderPlaced(DomainEvent):
    """For the reporting projector (ADR-012): which outlet/day to re-aggregate."""

    order_id: str
    outlet_id: str
    business_date: str
    total: int

    topic = "sales.order_placed"

    def to_payload(self) -> dict[str, object]:
        return {
            "order_id": self.order_id,
            "outlet_id": self.outlet_id,
            "business_date": self.business_date,
            "total": self.total,
        }
