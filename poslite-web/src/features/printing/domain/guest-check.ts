import { dateTime } from "./format";
import type { ReceiptDocument } from "./receipt-document";
import { itemsAndTotal, type ReceiptInput } from "./receipt-builder";

type Priced = Pick<ReceiptInput["order"], "lines" | "discount" | "rates" | "subtotal" | "discountAmount" | "serviceCharge" | "tax" | "total">;

export interface GuestCheckInput extends Priced {
  header: string;
  timezone: string;
  tableLabel: string;
  guestCount: number | null;
  printedBy: string;
  printedAt: string;
}

/** The bill a table asks for before paying (15 · UX-04): the order and its total, no number, no payment. */
export function buildGuestCheck(input: GuestCheckInput): ReceiptDocument {
  const guests = input.guestCount ? ` (${input.guestCount} tamu)` : "";
  return [
    { kind: "text", text: input.header, align: "center", bold: true },
    { kind: "rule" },
    { kind: "text", text: "** TAGIHAN **", align: "center", bold: true },
    { kind: "text", text: `Meja : ${input.tableLabel}${guests}` },
    { kind: "row", left: `Oleh : ${input.printedBy}`, right: dateTime(input.printedAt, input.timezone) },
    { kind: "rule" },
    ...itemsAndTotal(input),
    { kind: "rule" },
    { kind: "text", text: "Bukan bukti pembayaran. Struk dicetak setelah bayar.", align: "center" },
  ];
}
