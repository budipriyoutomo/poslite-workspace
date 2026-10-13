/** Per-device daily counter, stored with the order in the same transaction (03-offline-sync.md). */
export interface ReceiptCounter {
  businessDate: string; // YYYY-MM-DD
  seq: number;
}

/** Human-readable, offline-safe receipt number: {OUTLET_CODE}{DEVICE_CODE}-{YYMMDD}-{SEQ}. */
export function formatReceiptNo(p: { outletCode: string; deviceCode: string; businessDate: string; seq: number }): string {
  const yymmdd = p.businessDate.slice(2).replaceAll("-", "");
  return `${p.outletCode}${p.deviceCode}-${yymmdd}-${String(p.seq).padStart(4, "0")}`;
}

export function nextReceiptCounter(counter: ReceiptCounter | undefined, businessDate: string): ReceiptCounter {
  if (!counter || counter.businessDate !== businessDate) return { businessDate, seq: 1 };
  return { businessDate, seq: counter.seq + 1 };
}

/** Refunds have their own daily series on the device (ADR-023): {OUTLET}{DEVICE}-R{YYMMDD}-{SEQ}. */
export function formatRefundNo(p: { outletCode: string; deviceCode: string; businessDate: string; seq: number }): string {
  const yymmdd = p.businessDate.slice(2).replaceAll("-", "");
  return `${p.outletCode}${p.deviceCode}-R${yymmdd}-${String(p.seq).padStart(4, "0")}`;
}
