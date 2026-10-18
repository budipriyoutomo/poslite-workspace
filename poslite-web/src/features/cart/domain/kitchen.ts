import type { CartLine } from "./cart";

/** What a kitchen/bar ticket needs of a line: no prices. */
export interface KitchenLine {
  key: string;
  productId: string;
  name: string;
  quantity: number;
  modifiers: string[];
  note: string;
}

/** Units not on a kitchen ticket yet: new lines, or units added to a line already sent. */
export function kitchenPending(lines: CartLine[]): KitchenLine[] {
  return lines.flatMap((l) => {
    const quantity = l.quantity - (l.sentQuantity ?? 0);
    return quantity > 0 ? [{ key: l.key, productId: l.productId, name: l.name, quantity, modifiers: l.modifiers.map((m) => m.name), note: l.note }] : [];
  });
}

/** Records, per line key, the line quantity that is now on a ticket. */
export function markSent<L extends CartLine>(lines: L[], sent: Record<string, number>): L[] {
  return lines.map((l) => (l.key in sent ? { ...l, sentQuantity: sent[l.key] } : l));
}
