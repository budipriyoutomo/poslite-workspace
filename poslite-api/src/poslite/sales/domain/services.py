from poslite.sales.domain.value_objects import Discount, PriceBreakdown, PricedLine, Rates
from poslite.shared.domain.money import div_round_half_up


class PriceCalculator:
    """Order totals (06-domain-and-database.md, Order rules 8-9), identical to the device's
    calculate(): line discounts, then the order discount on what is left, service on the net,
    PB1 on net + service, all half-up integers. With prices that include tax (ADR-030) the
    guest pays the discounted price and PB1, then service, are taken out of it backwards."""

    def calculate(
        self, lines: list[PricedLine], discount: Discount | None, rates: Rates
    ) -> PriceBreakdown:
        subtotal = sum(line.total for line in lines)
        item_discounts = sum(self.line_discount(line.total, line.discount) for line in lines)
        discount_amount = item_discounts + self._discount(subtotal - item_discounts, discount)
        net = subtotal - discount_amount
        if rates.includes_tax:
            pre_tax = div_round_half_up(net * 10_000, 10_000 + rates.tax_bps)
            before_service = div_round_half_up(pre_tax * 10_000, 10_000 + rates.service_bps)
            return PriceBreakdown(
                subtotal, discount_amount, pre_tax - before_service, net - pre_tax, net
            )
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


class RefundAllocator:
    """Shares an order's total out to its lines (ADR-023), so refunds — whole or in steps — can
    never add up to more than what was paid. Mirrors `refund-allocation.ts` in poslite-web;
    both are pinned by tests/fixtures/refund-cases.json.

    net_i  = line gross - line discount (manual or promotion)
    base_i = net_i - its share of the order discount (proportional to net_i)
    alloc_i = its share of the order total (proportional to base_i)
    """

    @staticmethod
    def allocate(*, nets: list[int], order_discount: int, total: int) -> list[int]:
        shares = largest_remainder(order_discount, nets)
        return largest_remainder(total, [n - s for n, s in zip(nets, shares, strict=True)])

    @staticmethod
    def amount(
        *, allocated: int, quantity: int, already_refunded: int, refund_quantity: int
    ) -> int:
        """Refunding units one step at a time always adds up to `allocated` for the whole line."""
        if refund_quantity <= 0 or already_refunded + refund_quantity > quantity:
            raise ValueError(
                f"only {quantity - already_refunded} unit(s) left to refund, got {refund_quantity}"
            )
        after = div_round_half_up(allocated * (already_refunded + refund_quantity), quantity)
        return after - div_round_half_up(allocated * already_refunded, quantity)


def largest_remainder(value: int, weights: list[int]) -> list[int]:
    """`value` split proportionally to `weights`, summing to exactly `value`: floors first, then
    1 Rupiah each to the largest remainders (ties: the earliest line). All weights 0 → all 0."""
    total_weight = sum(weights)
    if total_weight == 0:
        return [0] * len(weights)
    parts = [value * w // total_weight for w in weights]
    order = sorted(range(len(weights)), key=lambda i: (-(value * weights[i] % total_weight), i))
    for i in order[: value - sum(parts)]:
        parts[i] += 1
    return parts
