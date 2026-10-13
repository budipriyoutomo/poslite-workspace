"""Manual discounts above a brand's cashier limits need a manager (06 Order rule 5).

Same fixture as poslite-web: device and server agree on when approval is needed.
"""

import json
from pathlib import Path
from typing import Any

import pytest

from poslite.sales.domain.discount_policy import DiscountLimits, needs_approval

CASES: list[dict[str, Any]] = json.loads(
    (Path(__file__).parents[2] / "fixtures" / "discount-approval-cases.json").read_text()
)


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_matches_the_shared_discount_fixture(case: dict[str, Any]) -> None:
    limits = DiscountLimits(case["limits"]["max_percentage"], case["limits"]["max_amount"])

    assert (
        needs_approval(
            role=case["role"],
            manual_percentages=case["manual_percentages"],
            manual_amount=case["manual_amount"],
            limits=limits,
        )
        is case["expected"]
    )


def test_manual_discounts_leave_promotions_out() -> None:
    from poslite.sales.domain.discount_policy import manual_discounts
    from poslite.sales.domain.entities import OrderLine
    from poslite.sales.domain.value_objects import Discount

    manual = OrderLine("L1", "P1", "Kopi", "Minuman", 20_000, 1, "", (), Discount("percentage", 25))
    promo = OrderLine(
        "L2", "P2", "Teh", "Minuman", 10_000, 2, "", (), Discount("fixed", 10_000), ("PR", "Promo")
    )

    percentages, amount = manual_discounts([manual, promo], Discount("fixed", 3_000))

    # 25% of 20.000 = 5.000 on the manual line + 3.000 order discount; the promo line is automatic
    assert (percentages, amount) == ([25], 8_000)
