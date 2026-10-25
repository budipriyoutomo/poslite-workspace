import type { Rates } from "./pricing";

/** What pricing needs of a sales channel (ADR-029). */
export interface ChannelPricing {
  priceMode: "base" | "markup_bps" | "price_list";
  markupBps: number;
  /** Markup prices go up to a multiple of this (Rupiah, ≥ 1). */
  markupRoundingUnit: number;
  appliesService: boolean;
  appliesTax: boolean;
}

/**
 * A product's price on a channel: the base price (outlet price, else product price), that price
 * marked up and rounded up to the unit, or the channel's own list price. null = not sold there.
 */
export function channelUnitPrice(basePrice: number, listPrice: number | null, channel: ChannelPricing): number | null {
  if (channel.priceMode === "base") return basePrice;
  if (channel.priceMode === "price_list") return listPrice;
  // Integer ceiling division (ADR-005: no floats for money).
  const raw = basePrice * (10_000 + channel.markupBps);
  const step = 10_000 * channel.markupRoundingUnit;
  const units = (raw - (raw % step)) / step + (raw % step === 0 ? 0 : 1);
  return units * channel.markupRoundingUnit;
}

/** Outlet rates on a channel: a rate the channel does not charge is 0 bps, in either price mode (ADR-029 rule 3). */
export function channelRates(outlet: Pick<Rates, "serviceBps" | "taxBps">, priceIncludesTax: boolean, channel: ChannelPricing): Rates {
  return { serviceBps: channel.appliesService ? outlet.serviceBps : 0, taxBps: channel.appliesTax ? outlet.taxBps : 0, includesTax: priceIncludesTax };
}

/**
 * The channel a sale is on: the one the cashier chose, else the brand's first channel of the
 * sale's kind (Dine In for a table's bill, Take Away otherwise). null = the device has none yet.
 */
export function pickChannel<C extends { id: string; kind: string; sortOrder: number }>(channels: C[], chosenId: string | null | undefined, kind: "dine_in" | "take_away"): C | null {
  const chosen = chosenId ? channels.find((c) => c.id === chosenId) : undefined;
  if (chosen) return chosen;
  return [...channels].filter((c) => c.kind === kind).sort((a, b) => a.sortOrder - b.sortOrder)[0] ?? null;
}

/** Orders keep their old type for reports and older servers: a delivery sale is a take-away. */
export const orderTypeOf = (kind: string): "dine_in" | "take_away" => (kind === "dine_in" ? "dine_in" : "take_away");
