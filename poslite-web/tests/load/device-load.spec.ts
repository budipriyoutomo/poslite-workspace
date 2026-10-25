// P1-10 device load test. Run: make web-load (PW_CHANNEL=chrome on macOS 13). Prints a Markdown
// table for poslite-docs/08; fails when a pilot target is missed.
import path from "node:path";

import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { build } from "esbuild";

import { API_URL } from "../../playwright.fullstack.config";
import type { SeedOptions, SeedResult } from "./load-seed";

const OPTIONS = { historyOrders: 3_000, days: 30, openBills: 5, pendingEvents: 500 };
// ≈ a mid-range Android tablet, as in the Fase 0 Dexie spike; LOAD_CPU=1 for a desktop baseline.
const CPU_THROTTLE = Number(process.env.LOAD_CPU ?? 4);
const TARGETS = { addItemMs: 100, payMs: 500, historyMs: 1_000, pushMs: 60_000 };

async function bundle(): Promise<string> {
  const out = await build({ entryPoints: [path.join(__dirname, "load-seed.ts")], bundle: true, write: false, format: "iife", globalName: "LoadSeed", target: "es2022" });
  return out.outputFiles[0]!.text;
}

async function call(api: APIRequestContext, method: "get" | "post" | "put", pathname: string, token?: string, data?: unknown, brandId?: string) {
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}`, ...(brandId && { "X-Brand-Id": brandId }) } : {};
  const response = await api[method](`${API_URL}${pathname}`, { data, headers });
  expect(response.ok(), `${method} ${pathname}: ${await response.text()}`).toBe(true);
  return (await response.json()).data;
}

async function tenant(api: APIRequestContext) {
  const owner = { email: `load-${Date.now()}@e2e.test`, password: "rahasia-123" };
  const response = await api.post(`${API_URL}/tenants/signup`, {
    headers: { "X-Forwarded-For": "198.51.100.250" },
    data: { business_name: "Warung Beban", slug: `load-${Date.now()}`, owner_name: "Budi", ...owner, outlet: { code: "JKT01", name: "Outlet Beban", timezone: "Asia/Jakarta" } },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const token: string = (await response.json()).data.token;
  const brandId: string = (await call(api, "get", "/me/access", token)).brands[0].id;
  const [outlet] = await call(api, "get", "/outlets", token, undefined, brandId);
  await call(api, "put", `/outlets/${outlet.id}`, token, { name: "Outlet Beban", timezone: "Asia/Jakarta", business_day_cutoff: "04:00", tax_rate_bps: 1000, service_rate_bps: 500 }, brandId);
  const category = await call(api, "post", "/categories", token, { name: "Minuman" }, brandId);
  await call(api, "post", "/products", token, { category_id: category.id, sku: "MN-1", name: "Kopi Susu", price: 18_000 }, brandId);
  await call(api, "post", "/payment-methods", token, { type: "cash", name: "Tunai", sort_order: 1 }, brandId);
  await call(api, "post", "/users", token, { name: "Rina", pin: "2468", outlets: [{ outlet_id: outlet.id, role: "cashier" }] }, brandId);
  return { token, brandId, outletId: outlet.id as string, owner };
}

/** Wall time of an action until its result shows (Playwright's own overhead included: an upper bound). */
async function timed(action: () => Promise<unknown>, done: () => Promise<unknown>): Promise<number> {
  const start = Date.now();
  await action();
  await done();
  return Date.now() - start;
}

const outboxSize = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open("poslite");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const request = open.result.transaction("outbox").objectStore("outbox").count();
          request.onsuccess = () => {
            resolve(request.result);
            open.result.close();
          };
        };
      }),
  );

test("a month of history and two hours offline at the peak stay fast and reach the server once", async ({ page, context, request }) => {
  const t = await tenant(request);
  await page.goto("/");
  await page.getByLabel("Email").fill(t.owner.email);
  await page.getByLabel("Password").fill(t.owner.password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.getByRole("button", { name: "Aktifkan" }).click();
  await expect(page.getByRole("button", { name: /Rina/ })).toBeVisible(); // master data pulled

  // Offline from here, like the dry run: the sync loop must not drain the seeded outbox yet. The CDP
  // session comes first: opening one later brings the network back.
  const cdp = await context.newCDPSession(page);
  await context.setOffline(true);
  await page.addScriptTag({ content: await bundle() });
  const seeded = await page.evaluate(
    (opts) => (window as unknown as { LoadSeed: { seed: (o: SeedOptions) => Promise<SeedResult> } }).LoadSeed.seed(opts),
    { ...OPTIONS, now: new Date().toISOString() },
  );
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });

  await page.getByRole("button", { name: /Rina/ }).click();
  for (const digit of "2468") await page.getByRole("button", { name: digit, exact: true }).click();
  await expect(page).toHaveURL(/\/sell$/); // the seeded shift is open
  expect(await outboxSize(page)).toBe(OPTIONS.pendingEvents); // nothing left the device yet
  // Let the stored cart load first: a tap before that is lost (noted in the P1-10 results).
  await page.waitForTimeout(3_000);

  const kopi = page.getByRole("button", { name: /^Kopi Susu/ });
  const addItemMs = await timed(
    () => kopi.click(),
    () => expect(page.getByRole("link", { name: /Bayar · Rp 20\.790/ })).toBeVisible(), // the cart shows it
  );
  await page.getByRole("link", { name: /Bayar · Rp 20\.790/ }).click();
  await page.getByRole("button", { name: "Rp 20.790" }).click();
  const payMs = await timed(
    () => page.getByRole("button", { name: "Selesaikan" }).click(),
    () => expect(page.getByRole("dialog", { name: "Transaksi berhasil" })).toBeVisible(),
  );
  await page.keyboard.press("Escape");
  const historyMs = await timed(
    () => page.getByRole("navigation", { name: "Menu utama" }).getByRole("link", { name: "Riwayat", exact: true }).click(),
    () => expect(page.getByRole("button", { name: /JKT01A-\d{6}-0501/ })).toBeVisible(),
  );

  // Back online: 500 pending events (+ the sale above) reach the server, once.
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const pending = await outboxSize(page);
  const pushMs = await timed(
    () => context.setOffline(false),
    () => expect.poll(() => outboxSize(page), { timeout: 120_000, intervals: [1_000] }).toBe(0),
  );
  const day = await page.evaluate(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date()));
  const orders = await call(request, "get", `/orders?outlet_id=${t.outletId}&business_date=${day}`, t.token, undefined, t.brandId);

  const results = [
    ["Tambah item ke cart (tap → tampil)", addItemMs, TARGETS.addItemMs],
    ["Bayar tunai sampai transaksi tersimpan", payMs, TARGETS.payMs],
    ["Buka riwayat order hari ini", historyMs, TARGETS.historyMs],
    [`Push ${pending} event setelah online`, pushMs, TARGETS.pushMs],
  ] as const;
  console.log(
    [
      `\n### Uji beban device (CPU ${CPU_THROTTLE}x, ${OPTIONS.historyOrders} order historis, ${OPTIONS.openBills} open bill, ${OPTIONS.pendingEvents} event pending)`,
      "",
      "| Metrik | Hasil | Target |",
      "|---|---|---|",
      ...results.map(([name, ms, target]) => `| ${name} | ${ms} ms | < ${target} ms |`),
      `| Ukuran IndexedDB setelah seed | ${(seeded.storageBytes / 1_048_576).toFixed(1)} MB | dicatat |`,
      `| Order di server (hari ini) | ${orders.length} | ${OPTIONS.pendingEvents} (499 seed + 1), tanpa duplikat |`,
      "",
    ].join("\n"),
  );

  expect(new Set(orders.map((o: { id: string }) => o.id)).size).toBe(orders.length);
  expect(orders.length).toBe(OPTIONS.pendingEvents);
  for (const [name, ms, target] of results) expect.soft(ms, name).toBeLessThan(target);
});
