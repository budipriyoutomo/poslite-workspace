export type CashKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "00" | "000" | "backspace" | "clear";

const NOTES = [5_000, 10_000, 20_000, 50_000, 100_000];
const FILL_STEP = 50_000;
const MAX_SUGGESTIONS = 4;
const MAX_CASH = 1_000_000_000;

function ceilTo(value: number, unit: number): number {
  return Math.ceil(value / unit) * unit;
}

/** Quick cash buttons: exact amount, the bill rounded up to common notes, then +50.000 steps. */
export function suggestCashAmounts(total: number): number[] {
  if (total <= 0) return [0];
  const amounts = [total];
  for (const note of NOTES) {
    const rounded = ceilTo(total, note);
    if (rounded > total && !amounts.includes(rounded)) amounts.push(rounded);
  }
  while (amounts.length < MAX_SUGGESTIONS) {
    amounts.push(ceilTo(amounts[amounts.length - 1]! + 1, FILL_STEP));
  }
  return amounts.slice(0, MAX_SUGGESTIONS);
}

/** Cash keypad: integer Rupiah only (the prototype's "." key is gone — ADR-005). */
export function pressCashKey(amount: number, key: CashKey): number {
  if (key === "clear") return 0;
  if (key === "backspace") return Math.floor(amount / 10);
  const next = Number(`${amount}${key}`);
  return next > MAX_CASH ? amount : next;
}
