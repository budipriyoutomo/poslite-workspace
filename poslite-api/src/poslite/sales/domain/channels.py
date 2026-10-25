"""Sales channels in pricing (ADR-029), identical to the device's channel-pricing.ts."""

from dataclasses import dataclass
from typing import Literal

from poslite.sales.domain.value_objects import Rates

PriceMode = Literal["base", "markup_bps", "price_list"]


@dataclass(frozen=True, slots=True)
class ChannelPricing:
    price_mode: PriceMode
    markup_bps: int
    markup_rounding_unit: int  # markup prices go up to a multiple of this (Rupiah, >= 1)
    applies_service: bool
    applies_tax: bool


def channel_unit_price(
    base_price: int, list_price: int | None, channel: ChannelPricing
) -> int | None:
    """The base price (outlet price, else product price), that price marked up and rounded up
    to the unit, or the channel's own list price. None = not sold on this channel."""
    if channel.price_mode == "base":
        return base_price
    if channel.price_mode == "price_list":
        return list_price
    step = 10_000 * channel.markup_rounding_unit
    return -(-(base_price * (10_000 + channel.markup_bps)) // step) * channel.markup_rounding_unit


def channel_rates(outlet: Rates, price_includes_tax: bool, channel: ChannelPricing) -> Rates:
    """A rate the channel does not charge is 0 bps, in either price mode (ADR-029 rule 3)."""
    return Rates(
        outlet.service_bps if channel.applies_service else 0,
        outlet.tax_bps if channel.applies_tax else 0,
        price_includes_tax,
    )
