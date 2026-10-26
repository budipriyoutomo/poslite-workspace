// 15 · UX-04: what a table looks like on the table screen. When several apply, the first wins:
// late (red) > bill printed (blue) > occupied (yellow) > empty.

export type TableState = "empty" | "occupied" | "printed" | "late";

/** Guests sitting longer than this turn the table red. */
export const LATE_AFTER_MINUTES = 90;

interface Table {
  id: string;
  label: string;
  area: string;
  sortOrder: number;
}

interface Bill {
  tableId: string | null;
  tableLabel: string;
  openedAt: string;
  printedAt?: string | null;
}

export interface TableTile<B extends Bill> {
  /** The table's id, or the bill's label for a table the outlet does not list. */
  key: string;
  tableId: string | null;
  label: string;
  area: string;
  state: TableState;
  bill: B | null;
  /** Minutes since the bill was opened; 0 for an empty table. */
  minutes: number;
  /** A late table keeps this mark of its printed bill. */
  isPrinted: boolean;
}

function tile<B extends Bill>(key: string, tableId: string | null, label: string, area: string, bill: B | undefined, now: Date): TableTile<B> {
  if (!bill) return { key, tableId, label, area, state: "empty", bill: null, minutes: 0, isPrinted: false };
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(bill.openedAt).getTime()) / 60_000));
  const isPrinted = Boolean(bill.printedAt);
  const state: TableState = minutes > LATE_AFTER_MINUTES ? "late" : isPrinted ? "printed" : "occupied";
  return { key, tableId, label, area, state, bill, minutes, isPrinted };
}

/** One tile per table in the outlet's order, then one per bill on a table the outlet does not list. */
export function tableTiles<B extends Bill>(tables: Table[], bills: B[], now: Date): TableTile<B>[] {
  const ordered = [...tables].sort((a, b) => a.sortOrder - b.sortOrder);
  const listed = new Set(ordered.map((t) => t.id));
  const onTables = ordered.map((t) => tile(t.id, t.id, t.label, t.area, bills.find((b) => b.tableId === t.id), now));
  const others = bills.filter((b) => !b.tableId || !listed.has(b.tableId)).map((b) => tile(`label:${b.tableLabel}`, b.tableId, b.tableLabel, "", b, now));
  return [...onTables, ...others];
}

export function countByState(tiles: { state: TableState }[]): Record<TableState, number> {
  const counts: Record<TableState, number> = { empty: 0, occupied: 0, printed: 0, late: 0 };
  for (const t of tiles) counts[t.state] += 1;
  return counts;
}

/** The area tabs: each area once, in the tables' order. */
export function areasOf(tables: Table[]): string[] {
  return [...new Set([...tables].sort((a, b) => a.sortOrder - b.sortOrder).flatMap((t) => (t.area ? [t.area] : [])))];
}
