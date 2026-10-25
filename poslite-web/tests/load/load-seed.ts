// P1-10 device load: fills the activated device's own database ("poslite") the way a month of
// trading and two hours offline at the peak would. Bundled with esbuild and run inside Chrome by
// device-load.spec.ts — not part of the app bundle. Rows follow src/shared/db/rows.ts.
import Dexie from "dexie";
import { monotonicFactory } from "ulidx";

import type { OpenBillRow, OrderRow, OutboxRow, PaymentRow, ProductRow, SettingRow, ShiftRow, UserRow } from "../../src/shared/db/rows";

export interface SeedOptions {
  historyOrders: number; // synced orders spread over `days` before today
  days: number;
  openBills: number;
  pendingEvents: number; // outbox: shift.opened + order.placed for the rest, all of today
  now: string;
}

export interface SeedResult {
  shiftId: string;
  pendingOrderIds: string[];
  storageBytes: number;
}

const ulid = monotonicFactory();
const half = (n: number, d: number) => Math.floor((2 * n + d) / (2 * d)); // divRoundHalfUp

function sale(product: ProductRow, quantity: number, rates: { serviceBps: number; taxBps: number }) {
  const subtotal = product.price * quantity;
  const serviceCharge = half(subtotal * rates.serviceBps, 10_000);
  const tax = half((subtotal + serviceCharge) * rates.taxBps, 10_000);
  return { subtotal, serviceCharge, tax, total: subtotal + serviceCharge + tax };
}

const ymd = (iso: string) => iso.slice(0, 10);

/** The outlet's business date (same rule as the app's businessDate): the device numbers receipts by it. */
function businessDate(at: Date, timeZone: string, cutoff: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at).map((x) => [x.type, x.value]),
  );
  const day = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
  if (`${p.hour}:${p.minute}` < cutoff) day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}
const receiptNo = (outlet: string, device: string, date: string, seq: number) => `${outlet}${device}-${date.slice(2).replaceAll("-", "")}-${String(seq).padStart(4, "0")}`;

export async function seed(opts: SeedOptions): Promise<SeedResult> {
  const db = new Dexie("poslite");
  await db.open(); // the app's schema, whatever version it is at
  const outlet = ((await db.table("settings").get("outlet")) as SettingRow).value;
  const cashier = ((await db.table("users").toArray()) as UserRow[]).find((u) => u.role === "cashier")!;
  const product = ((await db.table("products").toArray()) as ProductRow[])[0]!;
  const cash = (await db.table("paymentMethods").toArray()).find((m: { type: string }) => m.type === "cash") as { id: string; name: string };
  const rates = { serviceBps: outlet.serviceBps, taxBps: outlet.taxBps };
  const today = businessDate(new Date(opts.now), outlet.timezone, outlet.businessDayCutoff);
  const at = (minutesAgo: number) => new Date(Date.parse(opts.now) - minutesAgo * 60_000).toISOString();

  const orders: OrderRow[] = [];
  const payments: PaymentRow[] = [];
  const order = (shiftId: string, date: string, seq: number, createdAt: string, quantity: number, syncStatus: OrderRow["syncStatus"]): OrderRow => {
    const totals = sale(product, quantity, rates);
    const row: OrderRow = {
      id: ulid(),
      shiftId,
      receiptNo: receiptNo(outlet.outletCode, outlet.deviceCode, date, seq),
      cashierId: cashier.id,
      cashierName: cashier.name,
      businessDate: date,
      orderType: "take_away",
      lines: [{ id: ulid(), productId: product.id, productName: product.name, categoryName: "Minuman", unitPrice: product.price, quantity, notes: "", modifiers: [] }],
      discount: null,
      rates,
      subtotal: totals.subtotal,
      discountAmount: 0,
      serviceCharge: totals.serviceCharge,
      tax: totals.tax,
      total: totals.total,
      paidAmount: totals.total,
      changeAmount: 0,
      status: "paid",
      syncStatus,
      flags: [],
      createdAt,
    };
    orders.push(row);
    payments.push({ id: ulid(), orderId: row.id, paymentMethodId: cash.id, methodType: "cash", methodName: cash.name, amount: totals.total, reference: null, createdAt });
    return row;
  };

  // A month of synced history, one closed shift per day.
  const shifts: ShiftRow[] = [];
  const perDay = Math.ceil(opts.historyOrders / opts.days);
  for (let d = opts.days; d >= 1; d--) {
    const date = ymd(at(d * 24 * 60));
    const shift: ShiftRow = { id: ulid(), openedBy: cashier.id, openedAt: at(d * 24 * 60 + 600), openingCash: 200_000, businessDate: date, status: "closed", closedBy: cashier.id, closedAt: at(d * 24 * 60) };
    shifts.push(shift);
    for (let n = 1; n <= perDay && orders.length < opts.historyOrders; n++) order(shift.id, date, n, at(d * 24 * 60 + 600 - n), 1 + (n % 3), "synced");
  }

  // Today: an open shift and two hours offline at the peak, still in the outbox.
  const shift: ShiftRow = { id: ulid(), openedBy: cashier.id, openedAt: at(180), openingCash: 200_000, businessDate: today, status: "open" };
  shifts.push(shift);
  const outbox: OutboxRow[] = [
    { id: ulid(), type: "shift.opened", aggregateId: shift.id, occurredAt: shift.openedAt, payload: { opening_cash: 200_000, opened_by: cashier.id }, status: "pending", attempts: 0, createdAt: shift.openedAt },
  ];
  const pending: OrderRow[] = [];
  for (let n = 1; n < opts.pendingEvents; n++) {
    const createdAt = at(120 - (n * 120) / opts.pendingEvents);
    const row = order(shift.id, today, n, createdAt, 1 + (n % 3), "pending");
    pending.push(row);
    const paid = payments[payments.length - 1]!;
    outbox.push({
      id: ulid(),
      type: "order.placed",
      aggregateId: row.id,
      occurredAt: createdAt,
      payload: {
        shift_id: shift.id,
        receipt_no: row.receiptNo,
        cashier_id: cashier.id,
        order_type: "take_away",
        table_label: null,
        lines: row.lines.map((l) => ({ id: l.id, product_id: l.productId, product_name: l.productName, category_name: l.categoryName, unit_price: l.unitPrice, quantity: l.quantity, notes: "", modifiers: [], discount: null, promotion: null })),
        discount: null,
        rates: { service_bps: rates.serviceBps, tax_bps: rates.taxBps },
        totals: { subtotal: row.subtotal, discount_amount: 0, service_charge: row.serviceCharge, tax: row.tax, total: row.total },
        payments: [{ id: paid.id, payment_method_id: cash.id, method_type: "cash", amount: paid.amount, reference: null }],
        change_amount: 0,
        discount_approved_by: null,
      },
      status: "pending",
      attempts: 0,
      createdAt,
    });
  }

  const bills: OpenBillRow[] = Array.from({ length: opts.openBills }, (_, i) => ({
    id: ulid(),
    tableId: null,
    tableLabel: `L${i + 1}`,
    lines: [{ key: `k${i}`, productId: product.id, name: product.name, categoryName: "Minuman", unitPrice: product.price, modifiers: [], note: "", quantity: 2 }],
    discount: null,
    openedBy: cashier.id,
    openedAt: at(30),
    updatedAt: at(30),
    origin: "local",
  }));

  await db.transaction("rw", ["orders", "payments", "shifts", "outbox", "openBills", "syncState"], async () => {
    await db.table("shifts").bulkPut(shifts);
    await db.table("orders").bulkPut(orders);
    await db.table("payments").bulkPut(payments);
    await db.table("openBills").bulkPut(bills);
    await db.table("outbox").bulkAdd(outbox);
    // The device's receipt series continues after the seeded sales.
    await db.table("syncState").put({ key: "receiptCounter", value: { businessDate: today, seq: opts.pendingEvents } });
  });
  db.close();
  const storage = await navigator.storage.estimate();
  return { shiftId: shift.id, pendingOrderIds: pending.map((o) => o.id), storageBytes: storage.usage ?? 0 };
}
