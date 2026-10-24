from dataclasses import dataclass
from typing import Literal


def _rupiah(value: int, what: str) -> None:
    if not isinstance(value, int) or isinstance(value, bool):
        raise TypeError(f"{what} must be integer Rupiah, got {value!r}")
    if value < 0:
        raise ValueError(f"{what} must be >= 0, got {value}")


@dataclass(frozen=True, slots=True)
class Rates:
    """Outlet rates in basis points (500 = 5%); an order carries the snapshot it was sold with.
    `includes_tax`: the brand's prices already include service and PB1 (ADR-030)."""

    service_bps: int
    tax_bps: int
    includes_tax: bool = False

    def __post_init__(self) -> None:
        _rupiah(self.service_bps, "service_bps")
        _rupiah(self.tax_bps, "tax_bps")


@dataclass(frozen=True, slots=True)
class Discount:
    type: Literal["percentage", "fixed"]
    value: int  # percentage: integer 0..100; fixed: Rupiah

    def __post_init__(self) -> None:
        if self.type == "percentage" and (
            not isinstance(self.value, int) or not 0 <= self.value <= 100
        ):
            raise ValueError(f"percentage discount must be an integer 0..100, got {self.value!r}")
        _rupiah(self.value, "discount value")


@dataclass(frozen=True, slots=True)
class PricedLine:
    unit_price: int
    modifiers_total: int  # per unit
    quantity: int
    discount: Discount | None = None  # one per line: manual or from a promotion (ADR-016)

    def __post_init__(self) -> None:
        _rupiah(self.unit_price, "unit_price")
        _rupiah(self.modifiers_total, "modifiers_total")
        if not isinstance(self.quantity, int) or self.quantity <= 0:
            raise ValueError(f"quantity must be a positive integer, got {self.quantity!r}")

    @property
    def total(self) -> int:
        """Gross line value, before the line discount."""
        return (self.unit_price + self.modifiers_total) * self.quantity


@dataclass(frozen=True, slots=True)
class PriceBreakdown:
    subtotal: int
    discount_amount: int
    service_charge: int
    tax: int
    total: int
