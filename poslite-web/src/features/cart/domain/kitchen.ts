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

/** Units the kitchen already had that are taken off a bill (ADR-028): a void a manager approves. */
export interface VoidedLine {
  key: string;
  productId: string;
  name: string;
  modifiers: string[];
  /** With modifiers, before any discount. */
  unitPrice: number;
  quantity: number;
  amount: number;
}

/**
 * Compares the saved bill with what it is about to become: every sent unit no longer on its line is
 * voided. A line whose modifiers or note changed has a new key, so its sent units count as voided.
 */
export function voidedUnits(saved: CartLine[], next: CartLine[]): VoidedLine[] {
  const left = new Map<string, number>();
  for (const l of next) left.set(l.key, (left.get(l.key) ?? 0) + l.quantity);
  return saved.flatMap((l) => {
    const quantity = (l.sentQuantity ?? 0) - (left.get(l.key) ?? 0);
    if (quantity <= 0) return [];
    const unitPrice = l.unitPrice + l.modifiers.reduce((sum, m) => sum + m.price, 0);
    return [{ key: l.key, productId: l.productId, name: l.name, modifiers: l.modifiers.map((m) => m.name), unitPrice, quantity, amount: unitPrice * quantity }];
  });
}

/** Sent counts come from the saved bill (the kitchen may have printed since), capped at what is left. */
export function reconcileSent<L extends CartLine>(saved: CartLine[], next: L[]): L[] {
  const sent = new Map(saved.flatMap((l) => (l.sentQuantity !== undefined ? [[l.key, l.sentQuantity] as const] : [])));
  return next.map((l) => {
    const was = sent.get(l.key);
    if (was !== undefined) return { ...l, sentQuantity: Math.min(was, l.quantity) };
    const unsent = { ...l };
    delete unsent.sentQuantity;
    return unsent;
  });
}
