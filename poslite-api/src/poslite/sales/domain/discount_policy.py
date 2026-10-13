"""When a manual discount needs a manager (06 Order rule 5). Limits are set per brand.

Mirrors `discount-policy.ts` in poslite-web; both are pinned by
tests/fixtures/discount-approval-cases.json. Promotions (chosen at payment) never need approval.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import TYPE_CHECKING

from poslite.sales.domain.services import PriceCalculator

if TYPE_CHECKING:
    from poslite.sales.domain.entities import OrderLine
    from poslite.sales.domain.value_objects import Discount


@dataclass(frozen=True, slots=True)
class DiscountLimits:
    max_percentage: int  # a cashier may give up to this percentage alone (0..100)
    max_amount: int  # ...and up to this many Rupiah of manual discount per order


def needs_approval(
    *, role: str, manual_percentages: list[int], manual_amount: int, limits: DiscountLimits
) -> bool:
    if role != "cashier" or (not manual_percentages and manual_amount == 0):
        return False
    return (
        any(p > limits.max_percentage for p in manual_percentages)
        or manual_amount > limits.max_amount
    )


def manual_discounts(
    lines: Sequence["OrderLine"], order_discount: "Discount | None"
) -> tuple[list[int], int]:
    """Percentages and Rupiah of the discounts a person gave on a sale: manual line discounts
    (lines without a promotion) plus the order discount (06 Order rules 8-9)."""
    gross = [
        (line.unit_price + sum(m.price for m in line.modifiers)) * line.quantity for line in lines
    ]
    line_off = [
        PriceCalculator.line_discount(g, line.discount)
        for g, line in zip(gross, lines, strict=True)
    ]
    manual = [i for i, line in enumerate(lines) if line.discount and not line.promotion]
    order_off = PriceCalculator.line_discount(sum(gross) - sum(line_off), order_discount)
    percentages = [
        lines[i].discount.value  # type: ignore[union-attr]  # manual lines have a discount
        for i in manual
        if lines[i].discount.type == "percentage"  # type: ignore[union-attr]
    ]
    if order_discount and order_discount.type == "percentage":
        percentages.append(order_discount.value)
    return percentages, sum(line_off[i] for i in manual) + order_off
