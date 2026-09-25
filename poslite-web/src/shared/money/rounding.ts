/**
 * Half-up integer division for n >= 0: floor(n / d + 0.5) without float rounding (ADR-005).
 * Mirrors `div_round_half_up` in poslite-api; both are pinned by tests/fixtures/pricing-cases.json.
 */
export function divRoundHalfUp(n: number, d: number): number {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || n < 0 || d <= 0) {
    throw new RangeError(`divRoundHalfUp expects integers n >= 0 and d > 0, got ${n} / ${d}`);
  }
  return Math.floor((2 * n + d) / (2 * d));
}
