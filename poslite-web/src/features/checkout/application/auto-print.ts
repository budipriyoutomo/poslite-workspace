import { type PosDb, readState, writeState } from "@/shared/db";

/** "Cetak struk otomatis" (15 · UX-03): a per-device choice, off until a cashier turns it on. */
export async function isAutoPrintOn(db: PosDb): Promise<boolean> {
  return (await readState(db, "autoPrintReceipt")) ?? false;
}

export async function setAutoPrint(db: PosDb, on: boolean): Promise<void> {
  await writeState(db, "autoPrintReceipt", on);
}

/** Prints the receipt of a sale just made when auto print is on. A failed print never fails the sale. */
export async function printIfAuto(orderId: string, deps: { db: PosDb; print: (orderId: string) => Promise<boolean> }): Promise<"printed" | "off" | "failed"> {
  if (!(await isAutoPrintOn(deps.db))) return "off";
  return (await deps.print(orderId)) ? "printed" : "failed";
}
