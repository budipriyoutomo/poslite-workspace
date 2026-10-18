import type { ReceiptDocument } from "../domain/receipt-document";

/** A way to put a receipt on paper: system print (text) or ESC/POS over a printer driver. */
export interface ReceiptPrinter {
  print(doc: ReceiptDocument, columns: number): Promise<void>;
}
