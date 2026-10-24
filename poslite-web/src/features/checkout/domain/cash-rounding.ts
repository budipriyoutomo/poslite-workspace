import { divRoundHalfUp } from "@/shared/money";

/** Outlet setting (P1-3): unit 0 = off; 100, 500 or 1000 Rupiah. */
export type CashRoundingMode = "nearest" | "down";
export interface CashRoundingRule {
  unit: number;
  mode: CashRoundingMode;
}

/**
 * Rounds only what is paid in cash (P1-3): `cashDue = total − non-cash paid`, then to the outlet's
 * unit (half up, or down). The order total and tax never change; `rounding` (may be negative) is
 * what the drawer gets on top. Same rule as poslite-api, locked by cash-rounding-cases.json.
 */
export function cashRounding(total: number, nonCashPaid: number, rule: CashRoundingRule): { cashDue: number; cashCharged: number; rounding: number } {
  const cashDue = Math.max(0, total - nonCashPaid);
  if (rule.unit === 0 || cashDue === 0) return { cashDue, cashCharged: cashDue, rounding: 0 };
  const units = rule.mode === "nearest" ? divRoundHalfUp(cashDue, rule.unit) : Math.floor(cashDue / rule.unit);
  const cashCharged = units * rule.unit;
  return { cashDue, cashCharged, rounding: cashCharged - cashDue };
}
