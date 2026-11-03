import type { PrinterRole } from "./printer-status";

export type DriverType = "web-serial" | "web-bluetooth" | "web-usb" | "epson-epos" | "bridge";
export type SavedDriver = DriverType | "system" | "same-as-receipt";
/** How a printer connects, in the words of the outlet (15 · UX-08), not the browser API's. */
export type ConnectionKind = "lan" | "bluetooth" | "usb" | "system" | "same-as-receipt" | "none";

export interface KindChoice {
  kind: ConnectionKind;
  /** The driver behind it; null = this browser cannot (Bluetooth or USB on an iPad). */
  driver: SavedDriver | null;
}

const first = (supported: ReadonlySet<DriverType>, ...drivers: DriverType[]) => drivers.find((d) => supported.has(d)) ?? null;

/**
 * The wizard's "Cara terhubung" (ADR-007 drivers unchanged): Wi-Fi/LAN goes through the Print
 * Bridge, Bluetooth prefers Web Serial (Bluetooth Classic) over BLE, USB prefers WebUSB. The system
 * dialog and Epson ePOS stay under advanced settings.
 */
export function connectionKinds(role: PrinterRole, supported: ReadonlySet<DriverType>): KindChoice[] {
  const kinds: KindChoice[] = [
    { kind: "lan", driver: first(supported, "bridge") },
    { kind: "bluetooth", driver: first(supported, "web-serial", "web-bluetooth") },
    { kind: "usb", driver: first(supported, "web-usb", "web-serial") },
  ];
  return role === "receipt" ? kinds : [...kinds, { kind: "same-as-receipt", driver: "same-as-receipt" }, { kind: "none", driver: null }];
}

const KIND_OF: Record<SavedDriver, ConnectionKind> = {
  bridge: "lan",
  "epson-epos": "lan",
  "web-serial": "bluetooth", // Bluetooth Classic is what a Web Serial printer usually is
  "web-bluetooth": "bluetooth",
  "web-usb": "usb",
  system: "system",
  "same-as-receipt": "same-as-receipt",
};

export const kindOf = (driver: SavedDriver): ConnectionKind => KIND_OF[driver];
