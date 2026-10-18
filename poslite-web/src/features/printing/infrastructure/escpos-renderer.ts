import type { ReceiptDocument } from "../domain/receipt-document";
import { renderText } from "../domain/text-layout";

/**
 * ReceiptDocument → ESC/POS bytes (04-printing.md). Layout comes from renderText so paper matches the
 * on-screen preview column for column; the encoder only adds bold, codepages (é, ñ) and the cut.
 * The encoder (~108 kB) is loaded on first print, not with the POS bundle.
 */
export async function renderEscPos(doc: ReceiptDocument, columns: number): Promise<Uint8Array> {
  const { default: ReceiptPrinterEncoder } = await import("@point-of-sale/receipt-printer-encoder");
  const encoder = new ReceiptPrinterEncoder({ language: "esc-pos", columns, feedBeforeCut: 4 }).initialize().codepage("auto");
  for (const block of doc) {
    const isBold = block.kind !== "rule" && block.bold === true;
    if (isBold) encoder.bold(true);
    for (const line of renderText([block], columns)) encoder.line(line);
    if (isBold) encoder.bold(false);
  }
  return encoder.cut("partial").encode();
}
