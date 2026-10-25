import { describe, expect, it } from "vitest";

import cases from "../../../../tests/fixtures/channel-pricing-cases.json";
import { channelRates, channelUnitPrice, orderTypeOf, pickChannel } from "./channel-pricing";
import { calculate, type Discount } from "./pricing";

// Same fixture as poslite-api (ADR-029 × ADR-030): channel price, effective rates, then totals.
describe("channel pricing (shared fixture)", () => {
  it.each(cases)("$name", ({ brand_includes_tax, outlet_rates, channel, products, lines, discount, expected }) => {
    const ch = {
      priceMode: channel.price_mode as "base" | "markup_bps" | "price_list",
      markupBps: channel.markup_bps,
      markupRoundingUnit: channel.markup_rounding_unit,
      appliesService: channel.applies_service,
      appliesTax: channel.applies_tax,
    };
    const units = products.map((p) => channelUnitPrice(p.base_price, p.list_price, ch));
    const rates = channelRates({ serviceBps: outlet_rates.service_bps, taxBps: outlet_rates.tax_bps }, brand_includes_tax, ch);

    expect(units).toEqual(expected.unit_prices);
    expect(rates).toEqual({ serviceBps: expected.rates.service_bps, taxBps: expected.rates.tax_bps, includesTax: expected.rates.includes_tax });
    const priced = lines.map((l) => ({ unitPrice: units[l.product]!, modifiersTotal: l.modifiers_total, quantity: l.quantity, discount: "discount" in l ? (l.discount as Discount) : null }));
    const t = expected.totals;
    expect(calculate(priced, discount as Discount | null, rates)).toEqual({ subtotal: t.subtotal, discountAmount: t.discount_amount, serviceCharge: t.service_charge, tax: t.tax, total: t.total });
  });
});

describe("pickChannel", () => {
  const ch = (id: string, kind: string, sortOrder: number) => ({ id, kind, sortOrder });
  const channels = [ch("TA2", "take_away", 5), ch("DI", "dine_in", 1), ch("TA", "take_away", 2), ch("GO", "delivery", 3)];

  it("keeps the channel the cashier chose", () => {
    expect(pickChannel(channels, "GO", "take_away")?.id).toBe("GO");
  });

  it("falls back to the first channel of the sale's kind", () => {
    expect([pickChannel(channels, null, "take_away")?.id, pickChannel(channels, "GONE", "dine_in")?.id]).toEqual(["TA", "DI"]);
  });

  it("is null on a device without channels", () => {
    expect(pickChannel([], null, "take_away")).toBeNull();
  });
});

describe("orderTypeOf", () => {
  it("keeps dine-in and makes everything else a take-away for older reports", () => {
    expect(["dine_in", "take_away", "delivery"].map(orderTypeOf)).toEqual(["dine_in", "take_away", "take_away"]);
  });
});
