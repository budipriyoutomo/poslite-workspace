import type { PosDb } from "@/shared/db";
import { getDb } from "@/shared/db";
import { newId } from "@/shared/id";

import { buildKitchenTicket, type KitchenStation } from "../domain/kitchen-ticket";
import { browserPrinterDrivers } from "../infrastructure/browser-drivers";
import type { ReceiptPrinter } from "../infrastructure/receipt-printer";
import { createConfiguredPrinter, type PrinterRole, printerConfigFor } from "./configured-printer";
import { RECEIPT_COLUMNS } from "./load-receipt";
import { runPrintJob } from "./print-receipt";

export interface KitchenOrder {
  /** Order id, or the open bill's id before it is paid. */
  refId: string;
  /** What the cook sees as "No": the receipt number, or "Bill A1". */
  reference: string;
  tableLabel: string | null;
  cashierName: string;
  isAddition: boolean;
  /** Delivery app and its order number (ADR-029). */
  channel?: string;
  /** Sent items taken off a bill (ADR-028): printed as a BATAL ticket. */
  cancel?: { reason: string; approverName: string | null };
  lines: { key: string; productId: string; name: string; quantity: number; modifiers: string[]; note: string }[];
}

export interface KitchenPrintDeps {
  db: PosDb;
  printerFor: (role: PrinterRole) => ReceiptPrinter;
  now: () => Date;
  newId: () => string;
}

const STATIONS: KitchenStation[] = ["kitchen", "bar"];

const defaultDeps = (): KitchenPrintDeps => {
  const db = getDb();
  return { db, printerFor: (role) => createConfiguredPrinter(db, browserPrinterDrivers(), role), now: () => new Date(), newId };
};

/** Each line's station from its product's category (back-office "peran cetak"); unknown = none. */
async function stationsOf(db: PosDb, productIds: string[]): Promise<Map<string, PrinterRole>> {
  const products = await db.products.bulkGet(productIds);
  const categories = await db.categories.bulkGet([...new Set(products.flatMap((p) => (p ? [p.categoryId] : [])))]);
  const roleOf = new Map(categories.flatMap((c) => (c ? [[c.id, c.printRole] as const] : [])));
  return new Map(products.flatMap((p) => (p ? [[p.id, roleOf.get(p.categoryId) ?? "receipt"] as const] : [])));
}

/**
 * Prints one ticket per station (kitchen, bar) with that station's lines (04-printing.md "Routing
 * per role"). Never throws. `sentKeys` = lines the kitchen now knows about, or that need no
 * ticket; a failed station's lines stay unsent so the caller can try them again.
 */
export async function printKitchenTickets(order: KitchenOrder, deps: KitchenPrintDeps = defaultDeps()): Promise<{ sentKeys: string[]; hasFailed: boolean }> {
  const { db } = deps;
  const [roles, outlet] = await Promise.all([stationsOf(db, order.lines.map((l) => l.productId)), db.settings.get("outlet")]);
  const unsent = new Set<string>();
  for (const station of STATIONS) {
    const lines = order.lines.filter((l) => roles.get(l.productId) === station);
    const config = lines.length > 0 ? await printerConfigFor(db, station) : undefined;
    if (!config) continue; // nothing for this station, or no printer for it on this device
    const columns = RECEIPT_COLUMNS[config.paperWidth];
    const doc = buildKitchenTicket({
      station,
      tableLabel: order.tableLabel,
      reference: order.reference,
      cashierName: order.cashierName,
      at: deps.now().toISOString(),
      timezone: outlet?.value.timezone ?? "Asia/Jakarta",
      isAddition: order.isAddition,
      ...(order.cancel && { cancel: order.cancel }),
      ...(order.channel && { channel: order.channel }),
      lines,
    });
    const isPrinted = await runPrintJob({ orderId: order.refId, documentType: "kitchen_ticket" }, async () => ({ doc, columns }), { ...deps, printer: deps.printerFor(station) });
    if (!isPrinted) lines.forEach((l) => unsent.add(l.key));
  }
  return { sentKeys: order.lines.filter((l) => !unsent.has(l.key)).map((l) => l.key), hasFailed: unsent.size > 0 };
}
