import type { PricedLine } from "./priced-line";

/** Snapshot of a chosen modifier option: name and price are frozen at sale time. */
export interface LineModifier {
  optionId: string;
  groupId: string;
  name: string;
  price: number;
}

export type LineDiscount = { type: "percentage" | "fixed"; value: number };

export interface NewLine {
  productId: string;
  /** For category-wide promotions; missing on carts saved before Fase 4. */
  categoryId?: string;
  name: string;
  categoryName: string;
  unitPrice: number;
  modifiers: LineModifier[];
  note: string;
}

export interface CartLine extends NewLine {
  /** Lines with the same product, modifiers and note share a key and are merged. */
  key: string;
  quantity: number;
  discount?: LineDiscount | null;
  /** Units of an open bill already on a kitchen/bar ticket (Fase 7); absent = none. */
  sentQuantity?: number;
}

function mergeKey(line: Pick<NewLine, "productId" | "modifiers" | "note">): string {
  const optionIds = line.modifiers.map((m) => m.optionId).sort();
  return JSON.stringify([line.productId, optionIds, line.note.trim()]);
}

function withKey(line: NewLine, quantity: number): CartLine {
  const normalized = { ...line, note: line.note.trim() };
  return { ...normalized, key: mergeKey(normalized), quantity };
}

function insert(lines: CartLine[], line: CartLine): CartLine[] {
  const existing = lines.findIndex((l) => l.key === line.key);
  if (existing === -1) return [...lines, line];
  return lines.map((l, i) => (i === existing ? { ...l, quantity: l.quantity + line.quantity } : l));
}

export function addLine(lines: CartLine[], line: NewLine): CartLine[] {
  return insert(lines, withKey(line, 1));
}

export function changeQuantity(lines: CartLine[], key: string, delta: number): CartLine[] {
  return lines
    .map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l))
    .filter((l) => l.quantity > 0);
}

export function removeLine(lines: CartLine[], key: string): CartLine[] {
  return lines.filter((l) => l.key !== key);
}

/** Edit modifiers/note; the line keeps its position unless it now matches another line. */
export function updateLine(lines: CartLine[], key: string, change: Pick<NewLine, "modifiers" | "note">): CartLine[] {
  const index = lines.findIndex((l) => l.key === key);
  const current = lines[index];
  if (!current) return lines;
  const updated = withKey({ ...current, ...change }, current.quantity);
  const others = lines.filter((l) => l.key !== key);
  if (others.some((l) => l.key === updated.key)) return insert(others, updated);
  return [...others.slice(0, index), updated, ...others.slice(index)];
}

export function cartLines(lines: CartLine[]): PricedLine[] {
  return lines.map((l) => ({
    unitPrice: l.unitPrice,
    modifiersTotal: l.modifiers.reduce((sum, m) => sum + m.price, 0),
    quantity: l.quantity,
  }));
}

/** The cashier's own discount for one line; it replaces any promotion on that line (ADR-016). */
export function setLineDiscount(lines: CartLine[], key: string, discount: LineDiscount | null): CartLine[] {
  return lines.map((l) => (l.key === key ? { ...l, discount } : l));
}

/**
 * The lines at their prices on another sales channel (ADR-029); `priceOf` gives a product's unit
 * price there. null when a line is not sold on that channel: the cart stays as it is.
 */
export function repriceLines(lines: CartLine[], priceOf: (productId: string) => number | null): CartLine[] | null {
  const prices = lines.map((l) => priceOf(l.productId));
  if (prices.some((p) => p === null)) return null;
  return lines.map((l, i) => ({ ...l, unitPrice: prices[i]! }));
}
