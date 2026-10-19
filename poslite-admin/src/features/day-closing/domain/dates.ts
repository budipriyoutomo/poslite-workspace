const DAY_MS = 86_400_000;

/** `isoDate` moved by `days` calendar days ("2026-09-26", -1 → "2026-09-25"). */
export function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

const DATE_FORMAT = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** "Jumat, 25 September 2026" — a business date (no time zone shift: it is a calendar date). */
export const longDate = (isoDate: string) => DATE_FORMAT.format(new Date(`${isoDate}T00:00:00Z`));

/** "26/9/2026, 09.00" in the outlet's time zone. */
export const dateTime = (iso: string, timeZone: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short", timeZone }).format(new Date(iso));
