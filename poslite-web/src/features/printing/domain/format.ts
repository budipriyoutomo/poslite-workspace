/** Receipts show amounts without "Rp": 1.000.000, -7.500. */
export function amount(value: number): string {
  const digits = String(Math.abs(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return value < 0 ? `-${digits}` : digits;
}

/** dd/mm/yy hh:mm in the outlet's timezone, as printed on receipts. */
export function dateTime(iso: string, timeZone: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}
