/**
 * Operational date of the outlet (06-domain-and-database.md): the local calendar date in the
 * outlet's time zone, where times before `cutoff` (HH:MM, e.g. "04:00") belong to the previous day.
 */
export function businessDate(at: Date, timeZone: string, cutoff: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const localTime = `${parts.hour}:${parts.minute}`;
  const day = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  if (localTime < cutoff) day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}
