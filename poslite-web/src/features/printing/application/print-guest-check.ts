import { buildGuestCheck, type GuestCheckInput } from "../domain/guest-check";
import { RECEIPT_COLUMNS } from "./load-receipt";
import { defaultPrintDeps, type PrintDeps, runPrintJob } from "./print-receipt";

export type GuestCheck = Omit<GuestCheckInput, "header" | "timezone" | "printedAt"> & { billId: string };

/** The bill a table asks for, printed on the receipt printer (15 · UX-04). False when it did not print. */
export function printGuestCheck({ billId, ...check }: GuestCheck, deps: PrintDeps = defaultPrintDeps()): Promise<boolean> {
  return runPrintJob(
    { orderId: billId, documentType: "guest_check" },
    async () => {
      const [outlet, printer] = await Promise.all([deps.db.settings.get("outlet"), deps.db.printers.where("role").equals("receipt").first()]);
      if (!outlet) return undefined;
      const header = outlet.value.receiptHeader || (outlet.value.brand?.name ?? "");
      const doc = buildGuestCheck({ ...check, header, timezone: outlet.value.timezone, printedAt: deps.now().toISOString() });
      return { doc, columns: RECEIPT_COLUMNS[printer?.paperWidth ?? 58] };
    },
    deps,
  );
}
