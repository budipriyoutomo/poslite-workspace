import type { PosDb } from "@/shared/db";
import { getDb } from "@/shared/db";
import { newId } from "@/shared/id";

import type { ReceiptPrinter } from "../infrastructure/receipt-printer";
import { systemPrinter } from "../infrastructure/system-printer";
import { loadReceiptLines } from "./load-receipt";

export interface PrintDeps {
  db: PosDb;
  printer: ReceiptPrinter;
  now: () => Date;
  newId: () => string;
}

const defaultDeps = (): PrintDeps => ({ db: getDb(), printer: systemPrinter, now: () => new Date(), newId });

/**
 * Prints (or reprints) an order's receipt and records the attempt in printJobs.
 * Never throws: a failed print must not fail or roll back the sale (AGENTS.md §6).
 */
export async function printReceipt(orderId: string, deps: PrintDeps = defaultDeps()): Promise<boolean> {
  const { db } = deps;
  const job = { id: deps.newId(), orderId, status: "queued" as const, attempts: 1, createdAt: deps.now().toISOString() };
  try {
    await db.printJobs.add(job);
    const lines = await loadReceiptLines(db, orderId);
    if (!lines) throw new Error("order not found");
    await deps.printer.print(lines);
    await db.printJobs.update(job.id, { status: "printed" });
    return true;
  } catch (e) {
    await db.printJobs.update(job.id, { status: "failed", lastError: e instanceof Error ? e.message : String(e) }).catch(() => undefined);
    return false;
  }
}
