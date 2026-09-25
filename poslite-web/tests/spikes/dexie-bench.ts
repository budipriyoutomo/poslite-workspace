// Fase 0 Dexie spike: 5,000 realistic orders in real IndexedDB, timing the queries the POS needs.
// Bundled with esbuild and run inside Chrome by dexie-bench.spec.ts — not part of the app bundle.
// Schema indexes mirror docs/architecture/03-offline-sync.md (version 1).
import Dexie, { type Table } from "dexie";

interface OrderLine {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  modifiers: { name: string; price: number }[];
  note: string;
}

interface OrderRow {
  id: string;
  shiftId: string;
  outletId: string;
  deviceId: string;
  cashierId: string;
  receiptNo: string;
  status: "paid" | "void";
  syncStatus: "pending" | "synced";
  createdAt: string;
  lines: OrderLine[];
  subtotal: number;
  discountAmount: number;
  serviceCharge: number;
  tax: number;
  total: number;
  rates: { serviceBps: number; taxBps: number };
}

interface PaymentRow {
  id: string;
  orderId: string;
  methodId: string;
  amount: number;
  tendered: number;
  change: number;
}

interface OutboxRow {
  seq?: number;
  id: string;
  type: string;
  aggregateId: string;
  payload: unknown;
  status: "pending" | "sending" | "failed" | "dead";
  attempts: number;
  createdAt: string;
}

class BenchDb extends Dexie {
  orders!: Table<OrderRow, string>;
  payments!: Table<PaymentRow, string>;
  outbox!: Table<OutboxRow, number>;
  syncState!: Table<{ key: string; value: number }, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      orders: "id, shiftId, status, createdAt, receiptNo, syncStatus",
      payments: "id, orderId",
      outbox: "++seq, status, createdAt, aggregateId",
      syncState: "key",
    });
  }
}

export interface BenchOptions {
  orders: number;
  ordersPerDay: number;
  pendingOrders: number;
  runs: number;
}

export interface BenchResult {
  seedMs: number;
  counts: Record<string, number>;
  storage: { usageBeforeBytes: number; usageAfterBytes: number; jsonBytes: number };
  timings: Record<string, { p50: number; p95: number; rows: number }>;
}

const PRODUCTS = Array.from({ length: 120 }, (_, i) => ({
  id: `P${String(i).padStart(4, "0")}`,
  name: `Menu item ${i} — Nasi goreng spesial`,
  price: 15_000 + (i % 20) * 2_500,
}));

// Deterministic PRNG so every run seeds identical data.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1_103_515_245 + 12_345) % 2_147_483_648;
    return s / 2_147_483_648;
  };
}

function pad(n: number, width: number) {
  return String(n).padStart(width, "0");
}

function buildOrders(opts: BenchOptions): { orders: OrderRow[]; payments: PaymentRow[]; outbox: OutboxRow[] } {
  const rand = rng(42);
  const start = Date.UTC(2026, 7, 1, 2, 0, 0); // 09:00 WIB
  const orders: OrderRow[] = [];
  const payments: PaymentRow[] = [];
  const outbox: OutboxRow[] = [];
  for (let i = 0; i < opts.orders; i++) {
    const day = Math.floor(i / opts.ordersPerDay);
    const inDay = i % opts.ordersPerDay;
    const shift = day * 2 + (inDay < opts.ordersPerDay / 2 ? 0 : 1);
    const createdAt = new Date(start + day * 86_400_000 + inDay * 180_000).toISOString();
    const lineCount = 1 + Math.floor(rand() * 6);
    const lines: OrderLine[] = Array.from({ length: lineCount }, () => {
      const p = PRODUCTS[Math.floor(rand() * PRODUCTS.length)]!;
      return {
        productId: p.id,
        name: p.name,
        unitPrice: p.price,
        quantity: 1 + Math.floor(rand() * 3),
        modifiers: rand() < 0.4 ? [{ name: "Extra pedas", price: 2_000 }, { name: "Telur ceplok", price: 5_000 }] : [],
        note: rand() < 0.2 ? "Tidak pakai bawang" : "",
      };
    });
    const subtotal = lines.reduce(
      (s, l) => s + (l.unitPrice + l.modifiers.reduce((m, x) => m + x.price, 0)) * l.quantity,
      0,
    );
    const serviceCharge = Math.floor((2 * subtotal * 500 + 10_000) / 20_000);
    const tax = Math.floor((2 * (subtotal + serviceCharge) * 1_000 + 10_000) / 20_000);
    const id = `01J${pad(i, 23)}`;
    const isPending = i >= opts.orders - opts.pendingOrders;
    const order: OrderRow = {
      id,
      shiftId: `S${pad(shift, 5)}`,
      outletId: "OUTLET01",
      deviceId: "DEVICE0A",
      cashierId: `U${1 + (shift % 3)}`,
      receiptNo: `JKT01A-${createdAt.slice(2, 4)}${createdAt.slice(5, 7)}${createdAt.slice(8, 10)}-${pad(inDay + 1, 4)}`,
      status: rand() < 0.02 ? "void" : "paid",
      syncStatus: isPending ? "pending" : "synced",
      createdAt,
      lines,
      subtotal,
      discountAmount: 0,
      serviceCharge,
      tax,
      total: subtotal + serviceCharge + tax,
      rates: { serviceBps: 500, taxBps: 1_000 },
    };
    orders.push(order);
    const tendered = Math.ceil(order.total / 50_000) * 50_000;
    payments.push({ id: `${id}P`, orderId: id, methodId: "cash", amount: order.total, tendered, change: tendered - order.total });
    if (isPending) {
      outbox.push({ id: `${id}E`, type: "order.placed", aggregateId: id, payload: order, status: "pending", attempts: 0, createdAt });
    }
  }
  return { orders, payments, outbox };
}

async function time<T>(runs: number, fn: () => Promise<T>, size: (r: T) => number) {
  const samples: number[] = [];
  let rows = 0;
  await fn(); // warm-up: first read opens the connection and fills Chrome's IDB caches
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    const r = await fn();
    samples.push(performance.now() - t0);
    rows = size(r);
  }
  samples.sort((a, b) => a - b);
  const pick = (q: number) => Math.round(samples[Math.min(samples.length - 1, Math.floor(q * samples.length))]! * 10) / 10;
  return { p50: pick(0.5), p95: pick(0.95), rows };
}

async function usage() {
  const e = await navigator.storage.estimate();
  return e.usage ?? 0;
}

export async function run(opts: BenchOptions): Promise<BenchResult> {
  await Dexie.delete("poslite-bench");
  const usageBeforeBytes = await usage();
  const db = new BenchDb("poslite-bench");
  const data = buildOrders(opts);

  const t0 = performance.now();
  await db.transaction("rw", [db.orders, db.payments, db.outbox], async () => {
    await db.orders.bulkAdd(data.orders);
    await db.payments.bulkAdd(data.payments);
    await db.outbox.bulkAdd(data.outbox);
  });
  const seedMs = Math.round(performance.now() - t0);

  const last = data.orders[data.orders.length - 1]!;
  const middle = data.orders[Math.floor(data.orders.length / 2)]!;
  const lastDay = last.createdAt.slice(0, 10);
  const timings: BenchResult["timings"] = {};
  const count = (r: number) => r;
  const len = (r: unknown[]) => r.length;

  timings["history: latest 50 orders"] = await time(opts.runs, () => db.orders.orderBy("createdAt").reverse().limit(50).toArray(), len);
  timings["lookup: order by receiptNo"] = await time(opts.runs, () => db.orders.where("receiptNo").equals(middle.receiptNo).toArray(), len);
  timings["detail: order + payments by id"] = await time(
    opts.runs,
    async () => [await db.orders.get(middle.id), ...(await db.payments.where("orderId").equals(middle.id).toArray())],
    len,
  );
  timings["shift report: orders of one shift + sum"] = await time(
    opts.runs,
    async () => {
      const rows = await db.orders.where("shiftId").equals(last.shiftId).toArray();
      rows.reduce((s, o) => s + (o.status === "paid" ? o.total : 0), 0);
      return rows;
    },
    len,
  );
  timings["day report: today's orders by createdAt range"] = await time(
    opts.runs,
    () => db.orders.where("createdAt").between(`${lastDay}T00:00:00.000Z`, `${lastDay}T23:59:59.999Z`, true, true).toArray(),
    len,
  );
  timings["sync badge: count pending orders"] = await time(opts.runs, () => db.orders.where("syncStatus").equals("pending").count(), count);
  timings["sync push: next outbox batch (50, seq order)"] = await time(
    opts.runs,
    () => db.outbox.orderBy("seq").filter((r) => r.status === "pending" || r.status === "failed").limit(50).toArray(),
    len,
  );
  timings["worst case: scan all orders + aggregate"] = await time(
    Math.max(3, Math.floor(opts.runs / 4)),
    async () => {
      let total = 0;
      let n = 0;
      await db.orders.each((o) => {
        total += o.total;
        n++;
      });
      return total > 0 ? n : 0;
    },
    count,
  );

  // Place order = the cashier's write path: order + payment + outbox + receipt counter in one transaction.
  let seq = opts.orders;
  timings["write: place order (order+payment+outbox+counter)"] = await time(
    opts.runs,
    async () => {
      seq++;
      const id = `01K${pad(seq, 23)}`;
      const order = { ...last, id, receiptNo: `JKT01A-X-${seq}`, syncStatus: "pending" as const };
      await db.transaction("rw", [db.orders, db.payments, db.outbox, db.syncState], async () => {
        const counter = (await db.syncState.get("receiptSeq"))?.value ?? 0;
        await db.syncState.put({ key: "receiptSeq", value: counter + 1 });
        await db.orders.add(order);
        await db.payments.add({ id: `${id}P`, orderId: id, methodId: "cash", amount: order.total, tendered: order.total, change: 0 });
        await db.outbox.add({ id: `${id}E`, type: "order.placed", aggregateId: id, payload: order, status: "pending", attempts: 0, createdAt: order.createdAt });
      });
      return 1;
    },
    count,
  );

  const counts = { orders: await db.orders.count(), payments: await db.payments.count(), outbox: await db.outbox.count() };
  db.close();
  // Chrome updates the estimate lazily; reopening after close gives a settled figure.
  const usageAfterBytes = await usage();
  const jsonBytes = new TextEncoder().encode(JSON.stringify(data)).length;
  return { seedMs, counts, storage: { usageBeforeBytes, usageAfterBytes, jsonBytes }, timings };
}
