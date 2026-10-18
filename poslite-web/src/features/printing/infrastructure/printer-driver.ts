import type { PrinterDevice } from "@/shared/db";

/** Connection types from 04-printing.md; `system` prints HTML/text, the rest take ESC/POS bytes. */
export type ConnectionType = "system" | "web-serial" | "web-bluetooth" | "web-usb" | "epson-epos" | "bridge";

/** What is saved to find the same printer again without a dialog (see PrinterDevice). */
export type PairedDevice = PrinterDevice;

/** A byte transport to a printer. Tested against fakes; real hardware = manual checklist. */
export interface PrinterDriver {
  readonly type: Exclude<ConnectionType, "system">;
  /** `picker`: the browser's device dialog (pair) · `address`: a LAN printer the cashier types in. */
  readonly connection: "picker" | "address";
  isSupported(): boolean;
  /** Must run from a user gesture (the "Hubungkan printer" button) the first time. */
  pair(): Promise<PairedDevice>;
  /** Reconnects without a dialog to a device the browser already granted; no-op when connected. */
  connect(device: PairedDevice): Promise<void>;
  send(data: Uint8Array): Promise<void>;
  disconnect(): Promise<void>;
}
