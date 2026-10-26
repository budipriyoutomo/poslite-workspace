"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { getDb } from "@/shared/db";
import { useOutletSetting } from "@/shared/hooks";

import { channelRates, pickChannel } from "../domain/channel-pricing";
import type { Discount, PriceBreakdown, Rates } from "../domain/pricing";
import { type CartLineToPrice, priceCart } from "./price-cart";

const NO_PROMOTIONS_AT = { date: "", time: "", weekday: 0 };

/**
 * Prices an open bill as the table pays it: the Dine In channel's rates (ADR-029) and the line and
 * order discounts on the bill. Promotions are chosen at payment, so a printed bill shows none.
 */
export function useBillPricing(): ((lines: CartLineToPrice[], discount: Discount | null) => PriceBreakdown & { rates: Rates }) | undefined {
  const outlet = useOutletSetting();
  const channels = useLiveQuery(() => getDb().salesChannels.toArray(), []);
  if (!outlet || !channels) return undefined;
  const outletRates = { serviceBps: outlet.serviceBps, taxBps: outlet.taxBps, includesTax: outlet.priceIncludesTax === true };
  const channel = pickChannel(channels, null, "dine_in");
  const rates: Rates = channel ? channelRates(outletRates, outletRates.includesTax, channel) : outletRates;
  return (lines, discount) => ({ ...priceCart(lines, discount, rates, [], NO_PROMOTIONS_AT).totals, rates });
}
