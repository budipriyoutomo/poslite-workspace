export type Preset = "today" | "7d" | "30d";

const PRESET_DAYS: Record<Preset, number> = { today: 1, "7d": 7, "30d": 30 };
const DAY_MS = 86_400_000;

function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Business date of an outlet: local date in its time zone, before the cutoff = previous day. */
export function businessDate(at: Date, timeZone: string, cutoff = "04:00"): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  const date = `${p.year}-${p.month}-${p.day}`;
  return `${p.hour}:${p.minute}` < cutoff ? addDays(date, -1) : date;
}

/** Report range for a preset, in business dates (the server reports per business date too). */
export function dateRange(preset: Preset, now: Date, timeZone: string): { from: string; to: string } {
  const to = businessDate(now, timeZone);
  return { from: addDays(to, 1 - PRESET_DAYS[preset]), to };
}

export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}
