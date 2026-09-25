/** A way to put receipt text on paper. Web Serial / Bluetooth drivers (ESC/POS) come after the printer spike. */
export interface ReceiptPrinter {
  print(lines: string[]): Promise<void>;
}
