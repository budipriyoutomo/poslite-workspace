/** A sold-out mark this device made (P1-2), shown at once even offline, until the server has it. */
export interface AvailabilityOverride {
  productId: string;
  isAvailable: boolean;
  /** The mark lifts by itself then (ISO); null = until switched back on. */
  until: string | null;
  changedAt: string;
}

/** Whether the item can be sold now: this device's own mark first, then the server's. */
export function sellsNow(product: { isAvailable: boolean; unavailableUntil?: string | null }, override: AvailabilityOverride | undefined, now: Date): boolean {
  const at = now.toISOString();
  if (override) return override.isAvailable || (override.until !== null && override.until <= at);
  return product.isAvailable || (product.unavailableUntil != null && product.unavailableUntil <= at);
}

function localParts(at: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(at)
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  return parts;
}

/** When the business date of `now` ends: the next `cutoff` (HH:MM) in the outlet's time zone, as ISO UTC. */
export function endOfBusinessDate(now: Date, timeZone: string, cutoff: string): string {
  const [hour, minute] = cutoff.split(":").map(Number) as [number, number];
  const local = localParts(now, timeZone);
  const isBeforeCutoff = local.hour! * 60 + local.minute! < hour * 60 + minute;
  // The cutoff as if the zone were UTC, then shifted by the zone's offset at that moment.
  const guess = Date.UTC(local.year!, local.month! - 1, local.day! + (isBeforeCutoff ? 0 : 1), hour, minute);
  const there = localParts(new Date(guess), timeZone);
  const offset = Date.UTC(there.year!, there.month! - 1, there.day!, there.hour!, there.minute!) - guess;
  return new Date(guess - offset).toISOString();
}
