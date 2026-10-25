"""P1-3: only the part paid in cash is rounded, to the outlet's unit; the order total and tax never
change. Same fixture as poslite-web, so device and server agree."""

import json
from pathlib import Path
from typing import Any

import pytest

from poslite.sales.domain.cash_rounding import CashRounding, cash_rounding

CASES: list[dict[str, Any]] = json.loads(
    (Path(__file__).parents[2] / "fixtures" / "cash-rounding-cases.json").read_text()
)


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_cash_rounding(case: dict[str, Any]) -> None:
    result = cash_rounding(
        case["total"], case["non_cash_paid"], CashRounding(case["unit"], case["mode"])
    )

    assert {
        "cash_due": result.cash_due,
        "cash_charged": result.cash_charged,
        "rounding": result.rounding,
    } == case["expected"]
