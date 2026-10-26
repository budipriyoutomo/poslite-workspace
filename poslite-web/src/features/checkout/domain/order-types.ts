// 15 · UX-06: the order type is chosen first, above the cart, from the brand's sales channels.

export interface OrderType {
  /** The channel's id; "dine_in" / "take_away" on a device without channels (demo, older server). */
  value: string;
  label: string;
  isDineIn: boolean;
}

const FALLBACK: OrderType[] = [
  { value: "dine_in", label: "Makan di tempat", isDineIn: true },
  { value: "take_away", label: "Bawa pulang", isDineIn: false },
];

export function orderTypes(channels: { id: string; name: string; kind: string; sortOrder: number }[]): OrderType[] {
  if (channels.length === 0) return FALLBACK;
  return [...channels].sort((a, b) => a.sortOrder - b.sortOrder).map((c) => ({ value: c.id, label: c.name, isDineIn: c.kind === "dine_in" }));
}

/** A table's bill is dine-in; otherwise the sale's channel, else the first counter type. */
export function activeOrderType(types: OrderType[], sale: { hasBill: boolean; channelId: string | null }): string {
  if (sale.hasBill) return types.find((t) => t.isDineIn)?.value ?? "dine_in";
  return types.find((t) => t.value === sale.channelId)?.value ?? types.find((t) => !t.isDineIn)?.value ?? "take_away";
}
