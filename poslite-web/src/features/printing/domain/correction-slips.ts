import { amount, dateTime } from "./format";
import type { ReceiptBlock, ReceiptDocument } from "./receipt-document";

interface SlipLine {
  productName: string;
  quantity: number;
  amount: number;
}

export interface VoidSlipInput {
  header: string;
  timezone: string;
  receiptNo: string;
  voidedAt: string;
  voidedBy: string;
  approvedBy: string | null;
  reason: string;
  lines: SlipLine[];
  total: number;
  paymentMethods: { name: string; isCash: boolean }[];
}

export interface RefundSlipInput {
  header: string;
  timezone: string;
  refundNo: string;
  receiptNo: string;
  refundedAt: string;
  refundedBy: string;
  approvedBy: string | null;
  reason: string;
  lines: SlipLine[];
  total: number;
  payments: { methodName: string; amount: number; isCash: boolean }[];
}

const text = (value: string): ReceiptBlock => ({ kind: "text", text: value });

function heading(header: string, title: string): ReceiptDocument {
  return [{ kind: "text", text: header, align: "center", bold: true }, { kind: "rule" }, { kind: "text", text: `** ${title} **`, align: "center", bold: true }];
}

function people(at: string, timezone: string, by: string, approvedBy: string | null, reason: string): ReceiptDocument {
  return [text(`Waktu : ${dateTime(at, timezone)}`), text(`Oleh  : ${by}`), ...(approvedBy ? [text(`Setuju: ${approvedBy}`)] : []), text(`Alasan: ${reason}`), { kind: "rule" }];
}

const items = (lines: SlipLine[]): ReceiptDocument => lines.map((l) => ({ kind: "row", left: `${l.quantity}x ${l.productName}`, right: amount(l.amount) }));

/** Room for the approving manager's initials — the paper copy for the drawer (ADR-023). */
const signature: ReceiptDocument = [{ kind: "rule" }, text("Paraf:"), text(""), text(""), text("_".repeat(16))];

/** Slip for a voided order (04-printing.md `void_slip`). Non-cash payments must be reversed outside POSLite. */
export function buildVoidSlip(input: VoidSlipInput): ReceiptDocument {
  const nonCash = input.paymentMethods.filter((m) => !m.isCash).map((m) => m.name);
  return [
    ...heading(input.header, "SLIP VOID"),
    text(`Struk : ${input.receiptNo}`),
    ...people(input.voidedAt, input.timezone, input.voidedBy, input.approvedBy, input.reason),
    ...items(input.lines),
    { kind: "rule" },
    { kind: "row", left: "TOTAL VOID", right: amount(input.total), bold: true },
    text(`Dibayar: ${input.paymentMethods.map((m) => m.name).join(", ")}`),
    ...(nonCash.length > 0 ? [text(`* Batalkan ${nonCash.join(", ")} manual di EDC/aplikasi bank`)] : []),
    ...signature,
  ];
}

/** Slip for a (partial) refund (04-printing.md `refund_slip`), with how the money went back. */
export function buildRefundSlip(input: RefundSlipInput): ReceiptDocument {
  const nonCash = input.payments.filter((p) => !p.isCash).map((p) => p.methodName);
  return [
    ...heading(input.header, "SLIP REFUND"),
    text(`No    : ${input.refundNo}`),
    text(`Struk : ${input.receiptNo}`),
    ...people(input.refundedAt, input.timezone, input.refundedBy, input.approvedBy, input.reason),
    ...items(input.lines),
    { kind: "rule" },
    { kind: "row", left: "TOTAL REFUND", right: amount(input.total), bold: true },
    ...input.payments.map((p): ReceiptBlock => ({ kind: "row", left: `Dikembalikan: ${p.methodName}`, right: amount(p.amount) })),
    ...(nonCash.length > 0 ? [text(`* Kembalikan ${nonCash.join(", ")} manual di EDC/aplikasi bank`)] : []),
    ...signature,
  ];
}
