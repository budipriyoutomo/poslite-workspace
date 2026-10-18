import type { PosDb, PrintJobRow } from "@/shared/db";
import { getDb } from "@/shared/db";
import { newId } from "@/shared/id";

import type { ReceiptDocument } from "../domain/receipt-document";
import { browserPrinterDrivers } from "../infrastructure/browser-drivers";
import type { ReceiptPrinter } from "../infrastructure/receipt-printer";
import { createConfiguredPrinter } from "./configured-printer";
import { loadReceipt } from "./load-receipt";

export interface PrintDeps {
  db: PosDb;
  printer: ReceiptPrinter;
  now: () => Date;
  newId: () => string;
}

export const defaultPrintDeps = (): PrintDeps => {
  const db = getDb();
  return { db, printer: createConfiguredPrinter(db, browserPrinterDrivers()), now: () => new Date(), newId };
};

/**
 * Prints one document and records the attempt in printJobs. Never throws: a failed print must not
 * fail or roll back the sale, void or refund it belongs to (AGENTS.md §6).
 */
export async function runPrintJob(
  job: Pick<PrintJobRow, "orderId" | "documentType" | "refundId">,
  load: () => Promise<{ doc: ReceiptDocument; columns: number } | undefined>,
  deps: PrintDeps,
): Promise<boolean> {
  const { db } = deps;
  const row: PrintJobRow = { id: deps.newId(), ...job, status: "queued", attempts: 1, createdAt: deps.now().toISOString() };
  try {
    await db.printJobs.add(row);
    const document = await load();
    if (!document) throw new Error("document not found");
    await deps.printer.print(document.doc, document.columns);
    await db.printJobs.update(row.id, { status: "printed" });
    return true;
  } catch (e) {
    await db.printJobs.update(row.id, { status: "failed", lastError: e instanceof Error ? e.message : String(e) }).catch(() => undefined);
    return false;
  }
}

/** Prints (or reprints) an order's receipt. */
export function printReceipt(orderId: string, deps: PrintDeps = defaultPrintDeps()): Promise<boolean> {
  return runPrintJob({ orderId, documentType: "receipt" }, () => loadReceipt(deps.db, orderId), deps);
}
