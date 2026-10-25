import type { PosDb, PrinterConfigRow, PrinterDevice } from "@/shared/db";

import { buildTestPage } from "../domain/test-page";
import { createConfiguredPrinter, type PrinterDrivers, type PrinterRole, printerConfigFor } from "./configured-printer";
import { RECEIPT_COLUMNS } from "./load-receipt";
import { pairBridge } from "../infrastructure/bridge-driver";

export interface PrinterSetupDeps {
  db: PosDb;
  printers: PrinterDrivers;
  newId: () => string;
  now: () => Date;
}

export type PrinterDriverChoice = PrinterConfigRow["driver"];
/** What the settings screen offers per role; `none` = no printer for that station on this device. */
export type PrinterChoice = PrinterDriverChoice | "none";

const CHOICE_LABELS: Record<PrinterChoice, string> = {
  none: "Tidak dicetak",
  "same-as-receipt": "Pakai printer struk",
  system: "Dialog cetak sistem",
  "web-serial": "Bluetooth / USB (Web Serial)",
  "web-bluetooth": "Bluetooth LE",
  "web-usb": "USB (WebUSB)",
  "epson-epos": "Printer LAN Epson (ePOS)",
  bridge: "Printer LAN lewat Print Bridge",
};

/**
 * 04-printing.md: Settings → Printer lists only the connection types this browser supports. A
 * kitchen/bar station can also be left out or share the receipt printer (one-printer warung).
 */
export function choicesFor(role: PrinterRole, { drivers }: PrinterDrivers): PrinterChoice[] {
  const connections: PrinterChoice[] = ["system", ...Object.values(drivers).filter((d) => d.isSupported()).map((d) => d.type)];
  return role === "receipt" ? connections : ["none", "same-as-receipt", ...connections];
}

export const choiceLabel = (choice: PrinterChoice) => CHOICE_LABELS[choice];

export const getPrinter = (db: PosDb, role: PrinterRole = "receipt"): Promise<PrinterConfigRow | undefined> => db.printers.where("role").equals(role).first();

/** One printer per role per device. A different connection type forgets the paired device. */
export async function savePrinter(
  { role = "receipt", driver, paperWidth }: { role?: PrinterRole; driver: PrinterDriverChoice; paperWidth: 58 | 80 },
  { db, newId }: PrinterSetupDeps,
): Promise<void> {
  const current = await getPrinter(db, role);
  const device = current?.driver === driver ? current.device : undefined;
  await db.printers.put({ id: current?.id ?? newId(), role, driver, name: CHOICE_LABELS[driver], paperWidth, ...(device && { device }) });
}

/** The station's tickets stop until a printer is chosen again. */
export async function removePrinter(role: PrinterRole, { db }: PrinterSetupDeps): Promise<void> {
  await db.printers.where("role").equals(role).delete();
}

/** Opens the browser's device picker — call from a button click (user gesture). */
export async function pairPrinter({ db, printers }: PrinterSetupDeps, role: PrinterRole = "receipt"): Promise<void> {
  const current = await getPrinter(db, role);
  const driver = current && current.driver !== "system" && current.driver !== "same-as-receipt" ? printers.drivers[current.driver] : undefined;
  if (!current || !driver) throw new Error("PRINTER_NOT_PAIRABLE");
  const device = await driver.pair();
  await db.printers.put({ ...current, device });
}

/** Throws on failure so the settings screen can say why; receipts and tickets never do. */
export async function printTestPage({ db, printers, now }: PrinterSetupDeps, role: PrinterRole = "receipt"): Promise<void> {
  const [config, outlet] = await Promise.all([printerConfigFor(db, role), db.settings.get("outlet")]);
  const columns = RECEIPT_COLUMNS[config?.paperWidth ?? 58];
  const doc = buildTestPage({
    connection: CHOICE_LABELS[config?.driver ?? "system"],
    columns,
    printedAt: now().toISOString(),
    timezone: outlet?.value.timezone ?? "Asia/Jakarta",
  });
  await createConfiguredPrinter(db, printers, role).print(doc, columns);
}

/** LAN printers are found by an address the cashier types in, not a device picker. */
export const isAddressDriver = (choice: PrinterChoice): choice is "epson-epos" | "bridge" => choice === "epson-epos" || choice === "bridge";

/** Epson ePOS: the printer's address · Print Bridge: the bridge URL, its token and the printer's IP:port. */
export async function savePrinterAddress({ role = "receipt", device }: { role?: PrinterRole; device: PrinterDevice }, { db }: PrinterSetupDeps): Promise<void> {
  const current = await getPrinter(db, role);
  if (!current || !isAddressDriver(current.driver)) throw new Error("PRINTER_NOT_PAIRABLE");
  const fields = current.driver === "bridge" ? (["bridgeUrl", "bridgeToken", "address"] as const) : (["address"] as const);
  const cleaned = Object.fromEntries(fields.map((f) => [f, String(device[f] ?? "").trim()]));
  if (fields.some((f) => !cleaned[f])) throw new Error("PRINTER_ADDRESS_REQUIRED");
  await db.printers.put({ ...current, device: cleaned });
}

/** P1-5: the 6-digit code shown on the Print Bridge PC → the bridge token for this device. */
export const pairPrintBridge = (bridgeUrl: string, code: string): Promise<string> => pairBridge(bridgeUrl, code);
