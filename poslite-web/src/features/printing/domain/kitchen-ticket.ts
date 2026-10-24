import { dateTime } from "./format";
import { queueLabel } from "./receipt-builder";
import type { ReceiptBlock, ReceiptDocument } from "./receipt-document";

export type KitchenStation = "kitchen" | "bar";

export interface KitchenTicketInput {
  station: KitchenStation;
  tableLabel: string | null;
  /** Receipt number, or the bill's table label for a bill not paid yet. */
  reference: string;
  cashierName: string;
  at: string;
  timezone: string;
  /** Delivery app and its order number (ADR-029), e.g. "GOFOOD #GF-881234". */
  channel?: string;
  /** Take-away/delivery queue number and the guest's name (P1-1). */
  queue?: { no: string; customerName?: string | null };
  /** Items added to a bill whose earlier items were already sent. */
  isAddition: boolean;
  /** Items taken off a bill after they were sent (ADR-028): the cook stops making them. */
  cancel?: { reason: string; approverName: string | null };
  lines: { name: string; quantity: number; modifiers: string[]; note: string }[];
}

const TITLES: Record<KitchenStation, string> = { kitchen: "DAPUR", bar: "BAR" };

/** Kitchen/bar ticket (04-printing.md `kitchen-ticket`): what to make, for which table — no prices. */
export function buildKitchenTicket(input: KitchenTicketInput): ReceiptDocument {
  const doc: ReceiptDocument = [{ kind: "text", text: `** ${TITLES[input.station]} **`, align: "center", bold: true }];
  if (input.queue) doc.push({ kind: "text", text: queueLabel(input.queue.no, input.queue.customerName), align: "center", bold: true });
  if (input.channel) doc.push({ kind: "text", text: input.channel, align: "center", bold: true });
  if (input.cancel) doc.push({ kind: "text", text: "***  BATAL  ***", align: "center", bold: true });
  else if (input.isAddition) doc.push({ kind: "text", text: "+ TAMBAHAN +", align: "center" });
  doc.push(
    { kind: "text", text: `Meja  : ${input.tableLabel ?? "BAWA PULANG"}` },
    { kind: "text", text: `No    : ${input.reference}` },
    { kind: "row", left: `Kasir : ${input.cashierName}`, right: dateTime(input.at, input.timezone) },
    { kind: "rule" },
  );
  for (const line of input.lines) {
    doc.push({ kind: "text", text: `${line.quantity}x ${line.name}`, bold: true });
    doc.push(...line.modifiers.map((m): ReceiptBlock => ({ kind: "text", text: `   + ${m}` })));
    if (line.note) doc.push({ kind: "text", text: `   * ${line.note}` });
  }
  doc.push({ kind: "rule" });
  if (input.cancel) {
    doc.push({ kind: "text", text: `Alasan  : ${input.cancel.reason}` });
    if (input.cancel.approverName) doc.push({ kind: "text", text: `Disetujui: ${input.cancel.approverName}` });
  }
  return doc;
}
