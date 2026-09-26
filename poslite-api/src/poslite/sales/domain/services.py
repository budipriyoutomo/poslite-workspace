from poslite.sales.domain.value_objects import Discount, PriceBreakdown, PricedLine, Rates
from poslite.shared.domain.money import div_round_half_up


class PriceCalculator:
    """Order totals (06-domain-and-database.md), identical to the device's calculate():
    discount on the subtotal, service on the net, PB1 on net + service, all half-up integers."""

    def calculate(
        self, lines: list[PricedLine], discount: Discount | None, rates: Rates
    ) -> PriceBreakdown:
        subtotal = sum(line.total for line in lines)
        discount_amount = self._discount(subtotal, discount)
        net = subtotal - discount_amount
        service = div_round_half_up(net * rates.service_bps, 10_000)
        tax = div_round_half_up((net + service) * rates.tax_bps, 10_000)
        return PriceBreakdown(subtotal, discount_amount, service, tax, net + service + tax)

    @staticmethod
    def _discount(subtotal: int, discount: Discount | None) -> int:
        if discount is None:
            return 0
        if discount.type == "percentage":
            return div_round_half_up(subtotal * discount.value, 100)
        return min(discount.value, subtotal)
