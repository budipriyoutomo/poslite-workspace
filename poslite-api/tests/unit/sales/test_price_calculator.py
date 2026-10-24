import json
from pathlib import Path
from typing import Any

import pytest

from poslite.sales.domain.services import PriceCalculator
from poslite.sales.domain.value_objects import Discount, PriceBreakdown, PricedLine, Rates

CASES: list[dict[str, Any]] = json.loads(
    (Path(__file__).parents[2] / "fixtures" / "pricing-cases.json").read_text()
)


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_matches_the_shared_pricing_fixture(case: dict[str, Any]) -> None:
    """Same file as poslite-web's pricing tests: device and server compute identical totals."""
    discount = case["discount"]
    result = PriceCalculator().calculate(
        lines=[
            PricedLine(
                x["unit_price"],
                x["modifiers_total"],
                x["quantity"],
                Discount(x["discount"]["type"], x["discount"]["value"])
                if "discount" in x
                else None,
            )
            for x in case["lines"]
        ],
        discount=Discount(discount["type"], discount["value"]) if discount else None,
        rates=Rates(
            case["rates"]["service_bps"],
            case["rates"]["tax_bps"],
            includes_tax=case["rates"].get("includes_tax", False),
        ),
    )

    e = case["expected"]
    assert result == PriceBreakdown(
        e["subtotal"], e["discount_amount"], e["service_charge"], e["tax"], e["total"]
    )


@pytest.mark.parametrize("value", [101, -1])
def test_rejects_a_percentage_outside_0_to_100(value: int) -> None:
    with pytest.raises(ValueError, match="percentage"):
        Discount("percentage", value)


def test_rejects_a_non_positive_quantity() -> None:
    with pytest.raises(ValueError, match="quantity"):
        PricedLine(1000, 0, 0)


def test_rejects_non_integer_money() -> None:
    with pytest.raises(TypeError, match="integer"):
        PricedLine(1000.5, 0, 1)  # type: ignore[arg-type]  # the point of the test
