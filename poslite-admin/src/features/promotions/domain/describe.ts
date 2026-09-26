import { DAYS } from "./days";

interface Rule {
  type: "percent_off" | "buy_x_get_y";
  percentage?: number | null;
  buy_qty?: number | null;
  get_qty?: number | null;
}

interface Schedule {
  days_of_week: number[];
  start_time?: string | null;
  end_time?: string | null;
  starts_on?: string | null;
  ends_on?: string | null;
}

export const describeRule = (r: Rule) => (r.type === "percent_off" ? `Diskon ${r.percentage}%` : `Beli ${r.buy_qty} gratis ${r.get_qty}`);

export function describeSchedule(s: Schedule): string {
  const parts = [
    s.days_of_week.length ? s.days_of_week.map((d) => DAYS.find((x) => x.value === d)?.label).join(", ") : null,
    s.start_time && s.end_time ? `${s.start_time}–${s.end_time}` : null,
    s.starts_on ? `mulai ${s.starts_on}` : null,
    s.ends_on ? `s.d. ${s.ends_on}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Setiap hari";
}
