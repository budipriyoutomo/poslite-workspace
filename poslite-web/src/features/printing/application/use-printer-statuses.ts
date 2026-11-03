"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { getDb, type PosDb, type PrinterConfigRow } from "@/shared/db";

import { type PrinterRole, type PrinterStatus, printerStatus } from "../domain/printer-status";

export const ROLES: PrinterRole[] = ["receipt", "kitchen", "bar"];
/** Enough jobs to cover a service; older ones say nothing about the printer now. */
const RECENT_JOBS = 200;

export type PrinterStatuses = Record<PrinterRole, { config: PrinterConfigRow | undefined; status: PrinterStatus }>;

/** Each role's printer and its status from the print queue (15 · UX-08), live as jobs are written. */
export function usePrinterStatuses(db: PosDb = getDb()): PrinterStatuses | undefined {
  return useLiveQuery(async () => {
    const [configs, jobs] = await Promise.all([db.printers.toArray(), db.printJobs.orderBy("createdAt").reverse().limit(RECENT_JOBS).toArray()]);
    const entries = ROLES.map((role) => {
      const config = configs.find((c) => c.role === role);
      return [role, { config, status: printerStatus(role, config, jobs) }] as const;
    });
    return Object.fromEntries(entries) as PrinterStatuses;
  }, [db]);
}
