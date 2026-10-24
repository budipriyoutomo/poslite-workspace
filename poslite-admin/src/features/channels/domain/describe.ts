import { formatRupiah } from "@/shared/money";

export const KIND_LABEL = { dine_in: "Makan di tempat", take_away: "Bawa pulang", delivery: "Aplikasi delivery" } as const;
export const PRICE_MODE_LABEL = { base: "Harga menu", markup_bps: "Harga menu + markup", price_list: "Daftar harga sendiri" } as const;

/** How a channel prices the menu, in one line (ADR-029). */
export function describePricing(c: { price_mode: keyof typeof PRICE_MODE_LABEL; markup_bps: number; markup_rounding_unit: number; prices: unknown[] }): string {
  if (c.price_mode === "markup_bps") return `Harga menu +${String(c.markup_bps / 100).replace(".", ",")}%, dibulatkan ke atas ${formatRupiah(c.markup_rounding_unit)}`;
  if (c.price_mode === "price_list") return `Daftar harga sendiri · ${c.prices.length} menu`;
  return "Harga menu";
}
