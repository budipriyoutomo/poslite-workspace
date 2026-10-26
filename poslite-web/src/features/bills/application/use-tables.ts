"use client";

import { useBillPricing } from "@/features/checkout";
import type { OpenBillRow } from "@/shared/db";
import { useMinuteClock } from "@/shared/hooks";

import { areasOf, tableTiles } from "../domain/table-status";
import { useDiningTables, useOpenBills } from "./use-bills";

const gross = (bill: OpenBillRow) => bill.lines.reduce((s, l) => s + (l.unitPrice + l.modifiers.reduce((m, x) => m + x.price, 0)) * l.quantity, 0);

/** The table screen's data (15 · UX-04): a tile per table, the areas, and what each bill comes to. */
export function useTables() {
  const tables = useDiningTables();
  const bills = useOpenBills();
  const pricing = useBillPricing();
  const now = useMinuteClock();
  if (!tables || !bills) return undefined;
  /** The bill's total as the table pays it; before the outlet's rates load, the items' value. */
  const totalOf = (bill: OpenBillRow) => (pricing ? pricing(bill.lines, bill.discount).total : gross(bill));
  return { tiles: tableTiles(tables, bills, now), areas: areasOf(tables), bills, totalOf, pricing };
}
