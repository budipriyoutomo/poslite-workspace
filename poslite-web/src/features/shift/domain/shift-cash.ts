export interface ShiftOrder {
  status: "paid" | "voided";
  payments: { methodType: string; amount: number }[];
  changeAmount: number;
}

export interface CashMovement {
  type: "in" | "out";
  amount: number;
}

export interface ShiftCashSummary {
  openingCash: number;
  cashSales: number;
  cashChange: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
}

/** expected = opening + cash sales - cash change + cash in - cash out (06-domain-and-database.md). */
export function summarizeShiftCash(openingCash: number, orders: ShiftOrder[], movements: CashMovement[]): ShiftCashSummary {
  const paid = orders.filter((o) => o.status === "paid");
  const cashSales = paid.reduce(
    (sum, o) => sum + o.payments.filter((p) => p.methodType === "cash").reduce((s, p) => s + p.amount, 0),
    0,
  );
  const cashChange = paid.reduce((sum, o) => sum + o.changeAmount, 0);
  const cashIn = movements.filter((m) => m.type === "in").reduce((sum, m) => sum + m.amount, 0);
  const cashOut = movements.filter((m) => m.type === "out").reduce((sum, m) => sum + m.amount, 0);
  return { openingCash, cashSales, cashChange, cashIn, cashOut, expectedCash: openingCash + cashSales - cashChange + cashIn - cashOut };
}

/** Variance is recorded, never blocking: counted - expected (negative = shortage). */
export function closeShiftCash(expectedCash: number, countedCash: number) {
  if (!Number.isSafeInteger(countedCash) || countedCash < 0) {
    throw new RangeError(`counted cash must be an integer Rupiah >= 0, got ${countedCash}`);
  }
  return { expectedCash, countedCash, variance: countedCash - expectedCash };
}
