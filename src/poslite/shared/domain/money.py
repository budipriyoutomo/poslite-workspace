"""Money arithmetic helpers (ADR-005): integer Rupiah, rates in basis points, no floats."""


def div_round_half_up(n: int, d: int) -> int:
    """Half-up integer division for n >= 0. Mirrors `divRoundHalfUp` in poslite-web.

    Python's round() is banker's rounding (round(2.5) == 2); never use it for money.
    """
    if n < 0 or d <= 0:
        raise ValueError("div_round_half_up expects n >= 0 and d > 0")
    return (2 * n + d) // (2 * d)
