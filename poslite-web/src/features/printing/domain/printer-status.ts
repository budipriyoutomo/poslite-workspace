export type PrinterRole = "receipt" | "kitchen" | "bar";

export interface PrinterJob {
  /** Absent on jobs from before UX-08: they were all the receipt printer's. */
  role?: PrinterRole;
  status: "queued" | "printed" | "failed";
  orderId: string;
  createdAt: string;
}

export type PrinterStatus = { state: "ready" } | { state: "unreachable"; waiting: number } | { state: "unset" };

/** The test print's job: it shows whether the printer answers but is no ticket anyone waits for. */
export const TEST_PAGE_REF = "test-page";

/**
 * A printer's status on the settings screen and the sell screen (15 · UX-08), from its print jobs:
 * failed since it last printed = unreachable, with the tickets (bills, orders) still waiting.
 * No receipt printer saved is the system print dialog, which is always there.
 */
export function printerStatus(role: PrinterRole, config: { driver: string } | undefined, jobs: PrinterJob[]): PrinterStatus {
  if (!config && role !== "receipt") return { state: "unset" };
  const own = jobs.filter((j) => (j.role ?? "receipt") === role && j.status !== "queued").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const sinceLastPrint = own.slice(own.findLastIndex((j) => j.status === "printed") + 1);
  if (sinceLastPrint.length === 0) return { state: "ready" };
  return { state: "unreachable", waiting: new Set(sinceLastPrint.filter((j) => j.orderId !== TEST_PAGE_REF).map((j) => j.orderId)).size };
}
