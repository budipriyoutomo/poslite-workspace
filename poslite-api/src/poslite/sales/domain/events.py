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


@dataclass(frozen=True, slots=True)
class OrderVoided(DomainEvent):
    """The order's own day is re-aggregated without it (ADR-023)."""

    order_id: str
    outlet_id: str
    business_date: str

    topic = "sales.order_voided"

    def to_payload(self) -> dict[str, object]:
        return {
            "order_id": self.order_id,
            "outlet_id": self.outlet_id,
            "business_date": self.business_date,
        }


@dataclass(frozen=True, slots=True)
class OrderRefunded(DomainEvent):
    """The refund's day (not the order's) is re-aggregated with it (ADR-023)."""

    refund_id: str
    order_id: str
    outlet_id: str
    business_date: str

    topic = "sales.order_refunded"

    def to_payload(self) -> dict[str, object]:
        return {
            "refund_id": self.refund_id,
            "order_id": self.order_id,
            "outlet_id": self.outlet_id,
            "business_date": self.business_date,
        }
