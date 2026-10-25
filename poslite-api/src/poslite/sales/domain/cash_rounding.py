"""Cash rounding (P1-3): only what is paid in cash is rounded; the total and tax never change."""

from dataclasses import dataclass
from typing import Literal

from poslite.shared.domain.money import div_round_half_up

CashRoundingMode = Literal["nearest", "down"]


@dataclass(frozen=True, slots=True)
class CashRounding:
    unit: int  # 0 = off; 100, 500 or 1000 Rupiah
    mode: CashRoundingMode = "nearest"


@dataclass(frozen=True, slots=True)
class CashRoundingResult:
    cash_due: int
    cash_charged: int
    rounding: int  # may be negative: what the drawer gets on top of the total


def cash_rounding(total: int, non_cash_paid: int, rule: CashRounding) -> CashRoundingResult:
    """`cash_due = total - non-cash paid`, rounded half up (or down) to the unit. Mirrors
    `cashRounding` in poslite-web, locked by cash-rounding-cases.json."""
    cash_due = max(0, total - non_cash_paid)
    if rule.unit == 0 or cash_due == 0:
        return CashRoundingResult(cash_due, cash_due, 0)
    units = (
        div_round_half_up(cash_due, rule.unit) if rule.mode == "nearest" else cash_due // rule.unit
    )
    charged = units * rule.unit
    return CashRoundingResult(cash_due, charged, charged - cash_due)
