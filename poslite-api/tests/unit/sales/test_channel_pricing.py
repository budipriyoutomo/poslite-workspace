"""ADR-029 x ADR-030: a channel's unit price and effective rates, then the usual totals. Same
fixture as poslite-web, so device and server agree on every channel."""

import json
from pathlib import Path
from typing import Any

import pytest

from poslite.sales.domain.channels import ChannelPricing, channel_rates, channel_unit_price
from poslite.sales.domain.services import PriceCalculator
from poslite.sales.domain.value_objects import Discount, PricedLine, Rates

CASES: list[dict[str, Any]] = json.loads(
    (Path(__file__).parents[2] / "fixtures" / "channel-pricing-cases.json").read_text()
)


def _discount(d: dict[str, Any] | None) -> Discount | None:
    return Discount(d["type"], d["value"]) if d else None


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_matches_the_shared_channel_pricing_fixture(case: dict[str, Any]) -> None:
    c = case["channel"]
    channel = ChannelPricing(
        c["price_mode"],
        c["markup_bps"],
        c["markup_rounding_unit"],
        c["applies_service"],
        c["applies_tax"],
    )
    units = [
        channel_unit_price(p["base_price"], p["list_price"], channel) for p in case["products"]
    ]
    outlet = case["outlet_rates"]
    rates = channel_rates(
        Rates(outlet["service_bps"], outlet["tax_bps"]), case["brand_includes_tax"], channel
    )

    e = case["expected"]
    assert units == e["unit_prices"]
    assert rates == Rates(
        e["rates"]["service_bps"], e["rates"]["tax_bps"], e["rates"]["includes_tax"]
    )
    result = PriceCalculator().calculate(
        [
            PricedLine(
                units[x["product"]],
                x["modifiers_total"],
                x["quantity"],
                _discount(x.get("discount")),
            )
            for x in case["lines"]
        ],
        _discount(case["discount"]),
        rates,
    )
    t = e["totals"]
    assert (
        result.subtotal,
        result.discount_amount,
        result.service_charge,
        result.tax,
        result.total,
    ) == (
        t["subtotal"],
        t["discount_amount"],
        t["service_charge"],
        t["tax"],
        t["total"],
    )
