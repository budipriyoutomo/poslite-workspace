import { divRoundHalfUp } from "@/shared/money";

// Promotions the cashier chooses at payment, evaluated offline (ADR-016, 06 "Promo").

export interface Promotion {
  id: string;
  name: string;
  type: "percent_off" | "buy_x_get_y";
  percentage: number | null;
  buyQty: number | null;
  getQty: number | null;
  productIds: string[];
  categoryIds: string[];
  daysOfWeek: number[]; // ISO: 1 = Monday … 7 = Sunday; empty = every day
  startTime: string | null; // HH:MM
  endTime: string | null;
  startsOn: string | null; // YYYY-MM-DD
  endsOn: string | null;
}

export type Discount = { type: "percentage" | "fixed"; value: number };

export interface PromoLine {
  productId: string;
  categoryId?: string;
  unitPrice: number;
  modifiersTotal: number;
  quantity: number;
  manualDiscount: Discount | null;
}

export interface AppliedDiscount {
  discount: Discount | null;
  promotion: { id: string; name: string } | null;
}

/** Local date, time and ISO weekday in the outlet's time zone. */
export interface Moment {
  date: string;
  time: string;
  weekday: number;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function localMoment(at: Date, timeZone: string): Moment {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, weekday: WEEKDAYS.indexOf(parts.weekday!) + 1 };
}

function previousDay(at: Moment): Moment {
  const day = new Date(`${at.date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return { date: day.toISOString().slice(0, 10), time: at.time, weekday: at.weekday === 1 ? 7 : at.weekday - 1 };
}

/**
 * Inside the promotion's dates, days and hours. An overnight window (end < start) that is past
 * midnight belongs to the day it started, so "Fri 22:00–02:00" still runs at Sat 01:00.
 */
export function isScheduled(p: Promotion, at: Moment): boolean {
  let day = at;
  if (p.startTime && p.endTime && p.startTime !== p.endTime) {
    const overnight = p.endTime < p.startTime;
    const inWindow = overnight ? at.time >= p.startTime || at.time < p.endTime : at.time >= p.startTime && at.time < p.endTime;
    if (!inWindow) return false;
    if (overnight && at.time < p.endTime) day = previousDay(at);
  }
  if (p.daysOfWeek.length > 0 && !p.daysOfWeek.includes(day.weekday)) return false;
  if (p.startsOn && day.date < p.startsOn) return false;
  if (p.endsOn && day.date > p.endsOn) return false;
  return true;
}

function inScope(p: Promotion, line: PromoLine): boolean {
  const hasScope = p.productIds.length > 0 || p.categoryIds.length > 0;
  if (!hasScope) return p.type === "percent_off"; // buy X get Y always needs a scope
  return p.productIds.includes(line.productId) || (line.categoryId !== undefined && p.categoryIds.includes(line.categoryId));
}

function offer(p: Promotion, line: PromoLine): { discount: Discount; amount: number } | null {
  const unit = line.unitPrice + line.modifiersTotal;
  if (p.type === "percent_off") {
    const amount = divRoundHalfUp(unit * line.quantity * (p.percentage ?? 0), 100);
    return amount > 0 ? { discount: { type: "percentage", value: p.percentage! }, amount } : null;
  }
  const buy = p.buyQty ?? 0;
  const get = p.getQty ?? 0;
  if (buy <= 0 || get <= 0) return null;
  const free = Math.floor(line.quantity / (buy + get)) * get;
  return free > 0 ? { discount: { type: "fixed", value: free * unit }, amount: free * unit } : null;
}

/** One discount per line: the cashier's manual one, else the chosen promotion worth the most (tie → smaller id). */
export function applyPromotions(lines: PromoLine[], promotions: Promotion[], at: Moment): AppliedDiscount[] {
  const running = promotions.filter((p) => isScheduled(p, at)).sort((a, b) => (a.id < b.id ? -1 : 1));
  return lines.map((line) => {
    if (line.manualDiscount) return { discount: line.manualDiscount, promotion: null };
    let best: { discount: Discount; amount: number; promotion: Promotion } | null = null;
    for (const p of running) {
      if (!inScope(p, line)) continue;
      const o = offer(p, line);
      if (o && (!best || o.amount > best.amount)) best = { ...o, promotion: p };
    }
    return best ? { discount: best.discount, promotion: { id: best.promotion.id, name: best.promotion.name } } : { discount: null, promotion: null };
  });
}

export interface AvailablePromotion {
  promotion: { id: string; name: string };
  amount: number;
}

/**
 * Promotions the cashier may apply at payment: running now and cutting the price of at least one
 * line the cashier did not discount by hand. `amount` = the saving if it were the only one chosen.
 */
export function availablePromotions(lines: PromoLine[], promotions: Promotion[], at: Moment): AvailablePromotion[] {
  return promotions
    .filter((p) => isScheduled(p, at))
    .map((p) => ({
      promotion: { id: p.id, name: p.name },
      amount: lines.filter((l) => !l.manualDiscount && inScope(p, l)).reduce((sum, l) => sum + (offer(p, l)?.amount ?? 0), 0),
    }))
    .filter((a) => a.amount > 0)
    .sort((a, b) => b.amount - a.amount || (a.promotion.id < b.promotion.id ? -1 : 1));
}
