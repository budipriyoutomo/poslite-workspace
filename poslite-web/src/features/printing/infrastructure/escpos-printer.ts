import type { ReceiptDocument } from "../domain/receipt-document";
import { renderEscPos } from "./escpos-renderer";
import type { PairedDevice, PrinterDriver } from "./printer-driver";
import type { ReceiptPrinter } from "./receipt-printer";

/**
 * Prints ESC/POS over a byte driver. A printer switched off and on (or a tablet that slept) leaves a
 * dead connection behind, so one failed send reconnects and resends before giving up.
 */
export function createEscPosPrinter(driver: PrinterDriver, device: PairedDevice, render = renderEscPos): ReceiptPrinter {
  return {
    async print(doc: ReceiptDocument, columns: number) {
      const bytes = await render(doc, columns);
      await driver.connect(device);
      try {
        await driver.send(bytes);
      } catch {
        await driver.disconnect();
        await driver.connect(device);
        await driver.send(bytes);
      }
    },
  };
}
