import pytest

from poslite.shared.domain.money import div_round_half_up


@pytest.mark.parametrize(
    ("n", "d", "expected"),
    [
        (5, 10, 1),  # exactly .5
        (15, 10, 2),
        (70_875_000, 10_000, 7_088),  # PB1 10% of 70.875 = 7.087,5 (04-printing receipt)
    ],
)
def test_rounds_exact_half_up(n: int, d: int, expected: int) -> None:
    assert div_round_half_up(n, d) == expected


@pytest.mark.parametrize(
    ("n", "d", "expected"),
    [
        (4, 10, 0),
        (14, 10, 1),
        (33_750_000, 10_000, 3_375),  # service 5% of 67.500 — no remainder
        (0, 10_000, 0),
    ],
)
def test_rounds_below_half_down_and_keeps_exact_quotients(n: int, d: int, expected: int) -> None:
    assert div_round_half_up(n, d) == expected


@pytest.mark.parametrize(("n", "d"), [(-5, 10), (5, 0), (5, -10)])
def test_rejects_negative_numerator_or_non_positive_denominator(n: int, d: int) -> None:
    with pytest.raises(ValueError, match="n >= 0 and d > 0"):
        div_round_half_up(n, d)
