import type { OutletSetting, PosDb } from "@/shared/db";

// Valid Crockford ULIDs for readable tests.
export const IDS = {
  cashier: "01J8Z000000000000000000CA1",
  manager: "01J8Z000000000000000000MA1",
  cashMethod: "01J8Z000000000000000000PM1",
  qrisMethod: "01J8Z000000000000000000PM2",
  gudeg: "01J8Z000000000000000000PR1",
  esTeh: "01J8Z000000000000000000PR2",
  ayam: "01J8Z000000000000000000M01",
} as const;

export const OUTLET: OutletSetting = {
  outletId: "01J8Z000000000000000000T01",
  outletCode: "JKT01",
  outletName: "Outlet Kemang",
  deviceId: "01J8Z000000000000000000D01",
  deviceCode: "A",
  timezone: "Asia/Jakarta",
  businessDayCutoff: "04:00",
  serviceBps: 500,
  taxBps: 1_000,
  receiptHeader: "POSLite Kemang",
  receiptFooter: "Terima kasih",
};

export async function seedOutlet(db: PosDb, outlet: OutletSetting = OUTLET): Promise<void> {
  await db.settings.put({ key: "outlet", value: outlet });
  await db.paymentMethods.bulkPut([
    { id: IDS.cashMethod, type: "cash", name: "Tunai", requiresReference: false, sortOrder: 1 },
    { id: IDS.qrisMethod, type: "qris", name: "QRIS", requiresReference: false, sortOrder: 2 },
  ]);
}

let idCounter = 0;

/** Deterministic clock + unique, ordered ids for use-case tests. */
export function testDeps(db: PosDb, at = "2026-09-25T03:00:00.000Z") {
  let n = idCounter;
  idCounter += 1_000;
  return {
    db,
    now: () => new Date(at),
    newId: () => `01J8Z${String(++n).padStart(21, "0")}`,
  };
}
