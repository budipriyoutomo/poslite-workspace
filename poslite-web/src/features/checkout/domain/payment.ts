export type PaymentMethodType = "cash" | "debit" | "qris" | "credit_card" | "voucher" | "other";

export interface TenderedPayment {
  methodType: PaymentMethodType;
  amount: number; // Rupiah; for cash this is what the customer handed over
}

export type Settlement =
  | { ok: true; paidAmount: number; changeAmount: number }
  | { ok: false; reason: "NO_PAYMENT" | "NON_CASH_EXCEEDS_TOTAL" }
  | { ok: false; reason: "INSUFFICIENT"; remaining: number };

function sum(payments: TenderedPayment[]): number {
  return payments.reduce((total, p) => {
    if (!Number.isSafeInteger(p.amount) || p.amount < 0) {
      throw new RangeError(`payment amount must be an integer Rupiah >= 0, got ${p.amount}`);
    }
    return total + p.amount;
  }, 0);
}

export function remainingDue(total: number, payments: TenderedPayment[]): number {
  return Math.max(0, total - sum(payments));
}

/**
 * Order payment rules (06-domain-and-database.md): at least one payment, paid >= total,
 * non-cash never above the bill, change comes from cash only.
 */
export function settle(total: number, payments: TenderedPayment[]): Settlement {
  if (payments.length === 0) return { ok: false, reason: "NO_PAYMENT" };
  const paidAmount = sum(payments);
  const nonCash = sum(payments.filter((p) => p.methodType !== "cash"));
  if (nonCash > total) return { ok: false, reason: "NON_CASH_EXCEEDS_TOTAL" };
  if (paidAmount < total) return { ok: false, reason: "INSUFFICIENT", remaining: total - paidAmount };
  return { ok: true, paidAmount, changeAmount: paidAmount - total };
}
