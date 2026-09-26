from poslite.sales.domain.value_objects import Discount, PriceBreakdown, PricedLine, Rates
from poslite.shared.domain.money import div_round_half_up


class PriceCalculator:
    """Order totals (06-domain-and-database.md, Order rules 8-9), identical to the device's
    calculate(): line discounts, then the order discount on what is left, service on the net,
    PB1 on net + service, all half-up integers."""

    def calculate(
        self, lines: list[PricedLine], discount: Discount | None, rates: Rates
    ) -> PriceBreakdown:
        subtotal = sum(line.total for line in lines)
        item_discounts = sum(self.line_discount(line.total, line.discount) for line in lines)
        discount_amount = item_discounts + self._discount(subtotal - item_discounts, discount)
        net = subtotal - discount_amount
        service = div_round_half_up(net * rates.service_bps, 10_000)
        tax = div_round_half_up((net + service) * rates.tax_bps, 10_000)
        return PriceBreakdown(subtotal, discount_amount, service, tax, net + service + tax)

    @staticmethod
    def line_discount(gross: int, discount: Discount | None) -> int:
        return PriceCalculator._discount(gross, discount)

    @staticmethod
    def _discount(base: int, discount: Discount | None) -> int:
        if discount is None:
            return 0
        if discount.type == "percentage":
            return div_round_half_up(base * discount.value, 100)
        return min(discount.value, base)
