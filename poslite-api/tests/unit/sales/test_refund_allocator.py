"""ADR-023: the order total is shared out to its lines so refunds never exceed it.

Same fixture as poslite-web's refund-allocation tests: device and server refund the same amounts.
"""

import json
from pathlib import Path
from typing import Any

import pytest

from poslite.sales.domain.services import RefundAllocator

CASES: list[dict[str, Any]] = json.loads(
    (Path(__file__).parents[2] / "fixtures" / "refund-cases.json").read_text()
)


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_matches_the_shared_refund_fixture(case: dict[str, Any]) -> None:
    allocation = RefundAllocator.allocate(
        nets=[line["gross"] - line["line_discount"] for line in case["lines"]],
        order_discount=case["order_discount"],
        total=case["total"],
    )
    assert allocation == case["expected_allocation"]
    assert sum(allocation) == case["total"]

    refunded = [0] * len(case["lines"])
    for step in case["refunds"]:
        i = step["line"]
        amount = RefundAllocator.amount(
            allocated=allocation[i],
            quantity=case["lines"][i]["quantity"],
            already_refunded=refunded[i],
            refund_quantity=step["quantity"],
        )
        assert amount == step["expected_amount"]
        refunded[i] += step["quantity"]


def test_rejects_more_units_than_are_left() -> None:
    with pytest.raises(ValueError, match="left"):
        RefundAllocator.amount(allocated=100, quantity=2, already_refunded=1, refund_quantity=2)
