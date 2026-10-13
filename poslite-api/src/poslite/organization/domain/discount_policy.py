from dataclasses import dataclass, field


@dataclass(frozen=True, slots=True)
class DiscountPolicy:
    """A brand's manual-discount rules (06 Order rule 5): presets for the cashier, whether a
    typed value is allowed, and the cashier limits above which a manager's PIN is needed."""

    percentages: tuple[int, ...] = field(default=(5, 10, 15, 20))
    amounts: tuple[int, ...] = field(default=(5_000, 10_000, 25_000, 50_000))
    allow_custom: bool = True
    cashier_max_percentage: int = 20
    cashier_max_amount: int = 50_000

    def as_data(self) -> dict[str, object]:
        return {
            "percentages": list(self.percentages),
            "amounts": list(self.amounts),
            "allow_custom": self.allow_custom,
            "cashier_max_percentage": self.cashier_max_percentage,
            "cashier_max_amount": self.cashier_max_amount,
        }
