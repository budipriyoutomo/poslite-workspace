export type PaymentGroupKey = "cash" | "qris" | "card" | "other";

/** The payment method types of the master data (07 API contract). */
type MethodType = "cash" | "qris" | "debit" | "credit_card" | "voucher" | "other";

export interface PaymentGroup<M> {
  key: PaymentGroupKey;
  methods: M[];
}

const GROUP_OF: Record<MethodType, PaymentGroupKey> = {
  cash: "cash",
  qris: "qris",
  debit: "card",
  credit_card: "card",
  voucher: "other",
  other: "other",
};
const ORDER: PaymentGroupKey[] = ["cash", "qris", "card", "other"];

/**
 * Four buttons instead of one per method (15 · UX-03): Tunai, QRIS, Kartu (debit and credit) and
 * Lainnya (vouchers, transfers). Empty groups are left out; methods keep their master data order.
 */
export function groupPaymentMethods<M extends { type: MethodType; sortOrder: number }>(methods: M[]): PaymentGroup<M>[] {
  const sorted = [...methods].sort((a, b) => a.sortOrder - b.sortOrder);
  return ORDER.map((key) => ({ key, methods: sorted.filter((m) => GROUP_OF[m.type] === key) })).filter((g) => g.methods.length > 0);
}
