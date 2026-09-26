// Tax and service rates are integer basis points (ADR-005): 10% = 1000 bps. The owner types a
// percentage with at most two decimals ("5,5" or "5.5"); parsing works on digits, never floats.

/** "12,25" → 1225; null if not a percentage between 0 and 100 with ≤ 2 decimals. */
export function percentToBps(input: string): number | null {
  const match = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(input.trim());
  if (!match) return null;
  const bps = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return bps <= 10_000 ? bps : null;
}

/** 1225 → "12,25" (Indonesian decimal comma, no trailing zeros). */
export function bpsToPercent(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const fraction = String(bps % 100).padStart(2, "0").replace(/0+$/, "");
  return fraction ? `${whole},${fraction}` : String(whole);
}
