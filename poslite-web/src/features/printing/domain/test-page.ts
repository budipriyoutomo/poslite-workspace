import { dateTime } from "./format";
import type { ReceiptDocument } from "./receipt-document";

const PAPER_MM: Record<number, number> = { 32: 58, 48: 80 };

/** Settings → Printer "Test print": checks paper width (ruler), codepage (accents) and the cut. */
export function buildTestPage({ connection, columns, printedAt, timezone }: { connection: string; columns: number; printedAt: string; timezone: string }): ReceiptDocument {
  return [
    { kind: "text", text: "TEST PRINT POSLite", align: "center", bold: true },
    { kind: "rule" },
    { kind: "text", text: `Koneksi: ${connection}` },
    { kind: "text", text: `Kertas : ${PAPER_MM[columns] ?? "?"} mm (${columns} kolom)` },
    { kind: "text", text: `Waktu  : ${dateTime(printedAt, timezone)}` },
    { kind: "rule" },
    { kind: "text", text: "1234567890".repeat(5).slice(0, columns) },
    { kind: "text", text: "Karakter: é è ñ ü ç" },
    { kind: "row", left: "TOTAL", right: "1.000.000", bold: true },
    { kind: "rule" },
    { kind: "text", text: "Printer siap dipakai", align: "center" },
  ];
}
