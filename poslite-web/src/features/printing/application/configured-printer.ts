import type { PosDb, PrinterConfigRow } from "@/shared/db";

import { createEscPosPrinter } from "../infrastructure/escpos-printer";
import type { ConnectionType, PrinterDriver } from "../infrastructure/printer-driver";
import type { ReceiptPrinter } from "../infrastructure/receipt-printer";

export type { PairedDevice, PrinterDriver } from "../infrastructure/printer-driver";

export type PrinterRole = PrinterConfigRow["role"];

export interface PrinterDrivers {
  system: ReceiptPrinter;
  drivers: Partial<Record<Exclude<ConnectionType, "system">, PrinterDriver>>;
}

/** The printer saved for a role; a kitchen/bar role that shares the receipt printer resolves to it. */
export async function printerConfigFor(db: PosDb, role: PrinterRole): Promise<PrinterConfigRow | undefined> {
  const config = await db.printers.where("role").equals(role).first();
  return config?.driver === "same-as-receipt" ? db.printers.where("role").equals("receipt").first() : config;
}

/**
 * The printer saved on this device for a role (Settings → Printer), looked up on every print so a
 * change applies immediately. No receipt printer saved = the system print dialog, as before Fase 7.
 */
export function createConfiguredPrinter(db: PosDb, { system, drivers }: PrinterDrivers, role: PrinterRole = "receipt"): ReceiptPrinter {
  return {
    async print(doc, columns) {
      const config = await printerConfigFor(db, role);
      if (!config || config.driver === "system" || config.driver === "same-as-receipt") return system.print(doc, columns);
      const driver = drivers[config.driver];
      if (!driver?.isSupported()) throw new Error("PRINTER_UNSUPPORTED");
      if (!config.device) throw new Error("PRINTER_NOT_PAIRED");
      return createEscPosPrinter(driver, config.device).print(doc, columns);
    },
  };
}
