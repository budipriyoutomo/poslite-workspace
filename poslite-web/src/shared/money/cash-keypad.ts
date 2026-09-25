export type CashKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "00" | "000" | "backspace" | "clear";

const MAX_CASH = 1_000_000_000;

/** Money keypad: integer Rupiah only (the prototype's "." key is gone — ADR-005). */
export function pressCashKey(amount: number, key: CashKey): number {
  if (key === "clear") return 0;
  if (key === "backspace") return Math.floor(amount / 10);
  const next = Number(`${amount}${key}`);
  return next > MAX_CASH ? amount : next;
}
