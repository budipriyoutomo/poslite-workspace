"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { useCart } from "@/features/cart";
import { getDb, type SalesChannelRow } from "@/shared/db";
import { useOutletSetting } from "@/shared/hooks";

import { channelRates, channelUnitPrice, pickChannel } from "../domain/channel-pricing";
import type { Rates } from "../domain/pricing";

/**
 * The sale's channel (ADR-029) and what follows from it: the rates the screen prices with — the
 * same placeOrder snapshots — and a product's price on any channel. Without channels on the device
 * (demo, older server) the outlet's rates and the menu prices apply, as before.
 */
export function useSaleChannel() {
  const outlet = useOutletSetting();
  const channelId = useCart((s) => s.channelId);
  const hasBill = useCart((s) => s.bill !== null);
  const channels = useLiveQuery(() => getDb().salesChannels.orderBy("sortOrder").toArray(), []) ?? [];
  const basePrices = useLiveQuery(async () => new Map((await getDb().products.toArray()).map((p) => [p.id, p.price])), []);
  const channel = pickChannel(channels, channelId, hasBill ? "dine_in" : "take_away");
  const outletRates = { serviceBps: outlet?.serviceBps ?? 0, taxBps: outlet?.taxBps ?? 0, includesTax: outlet?.priceIncludesTax === true };
  const rates: Rates = channel ? channelRates(outletRates, outletRates.includesTax, channel) : outletRates;

  /** A product's unit price on a channel (default: the sale's); null = not sold there. */
  const priceOf = (product: { id: string; price: number }, on: SalesChannelRow | null = channel) =>
    on ? channelUnitPrice(product.price, on.prices[product.id] ?? null, on) : product.price;
  /** By product id, from the current menu (for moving a cart to another channel). */
  const priceById = (on: SalesChannelRow) => (productId: string) => {
    const base = basePrices?.get(productId);
    return base === undefined ? null : priceOf({ id: productId, price: base }, on);
  };
  return { channels, channel, rates, priceOf, priceById };
}
