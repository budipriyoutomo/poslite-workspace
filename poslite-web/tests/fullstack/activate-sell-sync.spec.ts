import { type APIRequestContext, expect, test } from "@playwright/test";

import { API_URL } from "../../playwright.fullstack.config";

// Fase 2 DoD in a browser: a real device is activated against the real API, sells with no
// network, and the sale reaches the server once it is back online.


// Active brand per back-office token (ADR-022): the owner works in the company's first brand.
const activeBrand = new Map<string, string>();

function headers(token?: string): Record<string, string> {
  if (!token) return {};
  const brandId = activeBrand.get(token);
  return { Authorization: `Bearer ${token}`, ...(brandId ? { "X-Brand-Id": brandId } : {}) };
}

async function call(api: APIRequestContext, method: "get" | "post" | "put", path: string, token?: string, data?: unknown) {
  const response = await api[method](`${API_URL}${path}`, { data, headers: headers(token) });
  expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBe(true);
  return (await response.json()).data;
}

async function tenantWithMenu(api: APIRequestContext) {
  const owner = { email: `owner-${Date.now()}@e2e.test`, password: "rahasia-123" };
  const signup = await call(api, "post", "/tenants/signup", undefined, {
    business_name: "Warung E2E",
    slug: `e2e-${Date.now()}`,
    owner_name: "Budi",
    ...owner,
    outlet: { code: "JKT01", name: "Outlet E2E", timezone: "Asia/Jakarta" },
  });
  const token: string = signup.token;
  activeBrand.set(token, (await call(api, "get", "/me/access", token)).brands[0].id);
  const [outlet] = await call(api, "get", "/outlets", token);
  await call(api, "put", `/outlets/${outlet.id}`, token, {
    name: "Outlet E2E",
    timezone: "Asia/Jakarta",
    business_day_cutoff: "04:00",
    tax_rate_bps: 1000,
    service_rate_bps: 500,
    receipt_header: "Warung E2E",
    receipt_footer: "Terima kasih",
  });
  const category = await call(api, "post", "/categories", token, { name: "Minuman" });
  await call(api, "post", "/products", token, { category_id: category.id, sku: "MN-1", name: "Kopi Susu E2E", price: 18000 });
  await call(api, "post", "/payment-methods", token, { type: "cash", name: "Tunai", sort_order: 1 });
  await call(api, "post", "/users", token, { name: "Rina", pin: "2468", outlets: [{ outlet_id: outlet.id, role: "cashier" }] });
  return { token, outletId: outlet.id as string, owner };
}

test("activate a device, sell offline, and the sale reaches the server", async ({ page, context, request }) => {
  const tenant = await tenantWithMenu(request);

  await page.goto("/");
  await expect(page).toHaveURL(/\/activate$/);
  await page.getByLabel("Email").fill(tenant.owner.email);
  await page.getByLabel("Password").fill(tenant.owner.password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.getByRole("button", { name: "Aktifkan" }).click();

  // The cashier list and the brand on the lock screen came from the server (sync pull).
  await expect(page.getByRole("heading", { name: "Warung E2E" })).toBeVisible(); // brand = business name at signup (ADR-022)
  await page.getByRole("button", { name: /Rina/ }).click();
  for (const digit of "2468") await page.getByRole("button", { name: digit, exact: true }).click();
  await expect(page).toHaveURL(/\/shift$/);
  await page.getByRole("button", { name: "Buka Shift" }).click();
  await expect(page).toHaveURL(/\/sell$/);

  await context.setOffline(true);
  await page.getByRole("button", { name: /Kopi Susu E2E/ }).click();
  // 18.000 + service 900 + PB1 1.890 = 20.790
  await page.getByRole("link", { name: /Bayar · Rp 20\.790/ }).click();
  await page.getByRole("button", { name: "Rp 20.790" }).click();
  await page.getByRole("button", { name: "Selesaikan" }).click();
  const receiptNo = (await page.getByRole("dialog").getByText(/^JKT01A-\d{6}-0001$/).textContent())!;

  await context.setOffline(false); // back online → the sync loop pushes the outbox
  await expect
    .poll(
      async () => {
        const businessDate = `20${receiptNo.slice(7, 9)}-${receiptNo.slice(9, 11)}-${receiptNo.slice(11, 13)}`;
        const orders = await call(request, "get", `/orders?outlet_id=${tenant.outletId}&business_date=${businessDate}`, tenant.token);
        return orders.map((o: { receipt_no: string; total: number; flags: string[] }) => [o.receipt_no, o.total, o.flags]);
      },
      { timeout: 30_000 },
    )
    .toEqual([[receiptNo, 20_790, []]]);
});

// Fase 4 DoD: a promotion and a table set in the back-office reach the device; the device prices the
// promotion offline and the server stores the same total without TOTAL_MISMATCH.
test("a back-office promotion the cashier chooses at payment applies offline on a dine-in bill and the server agrees", async ({ page, context, request }) => {
  const tenant = await tenantWithMenu(request);
  const [kopi] = await call(request, "get", "/products", tenant.token);
  await call(request, "post", `/outlets/${tenant.outletId}/tables`, tenant.token, { label: "A1", area: "Dalam", seats: 4, sort_order: 0 });
  await call(request, "post", "/promotions", tenant.token, {
    name: "Beli 2 gratis 1",
    type: "buy_x_get_y",
    buy_qty: 2,
    get_qty: 1,
    product_ids: [kopi.id],
  });

  await page.goto("/");
  await page.getByLabel("Email").fill(tenant.owner.email);
  await page.getByLabel("Password").fill(tenant.owner.password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.getByRole("button", { name: "Aktifkan" }).click();
  await page.getByRole("button", { name: /Rina/ }).click();
  for (const digit of "2468") await page.getByRole("button", { name: digit, exact: true }).click();
  await page.getByRole("button", { name: "Buka Shift" }).click();
  await expect(page).toHaveURL(/\/sell$/);

  await context.setOffline(true);
  await page.getByRole("button", { name: "Makan di tempat" }).click();
  await page.getByRole("button", { name: /A1/ }).click();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: /^Kopi Susu E2E/ }).click();
  // No promotion until the cashier chooses it: 54.000; service 2.700; PB1 5.670 → 62.370
  await page.getByRole("link", { name: /Bayar · Rp 62\.370/ }).click();
  const promo = page.getByRole("button", { name: /Beli 2 gratis 1/ });
  await expect(promo).toHaveAttribute("aria-pressed", "false");
  await promo.click();
  await expect(promo).toHaveAttribute("aria-pressed", "true");
  // 54.000 − 18.000 = 36.000; service 1.800; PB1 3.780 → 41.580
  await page.getByRole("button", { name: "Rp 41.580" }).click();
  await page.getByRole("button", { name: "Selesaikan" }).click();
  const receiptNo = (await page.getByRole("dialog").getByText(/^JKT01A-\d{6}-0001$/).textContent())!;

  await context.setOffline(false);
  const businessDate = `20${receiptNo.slice(7, 9)}-${receiptNo.slice(9, 11)}-${receiptNo.slice(11, 13)}`;
  await expect
    .poll(
      async () =>
        (await call(request, "get", `/orders?outlet_id=${tenant.outletId}&business_date=${businessDate}`, tenant.token)).map(
          (o: { receipt_no: string; total: number; flags: string[] }) => [o.receipt_no, o.total, o.flags],
        ),
      { timeout: 30_000 },
    )
    .toEqual([[receiptNo, 41_580, []]]);
});

// Fase 5 DoD (ADR-019): online, the cashier shows a dynamic QR; the gateway confirms it and the
// order reaches the server without QRIS_UNPAID.
test("a dynamic QRIS paid through the gateway settles the sale without flags", async ({ page, request }) => {
  const tenant = await tenantWithMenu(request);
  await call(request, "post", "/payment-methods", tenant.token, { type: "qris", name: "QRIS", sort_order: 2 });

  await page.goto("/");
  await page.getByLabel("Email").fill(tenant.owner.email);
  await page.getByLabel("Password").fill(tenant.owner.password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.getByRole("button", { name: "Aktifkan" }).click();
  await page.getByRole("button", { name: /Rina/ }).click();
  for (const digit of "2468") await page.getByRole("button", { name: digit, exact: true }).click();
  await page.getByRole("button", { name: "Buka Shift" }).click();

  await page.getByRole("button", { name: /^Kopi Susu E2E/ }).click();
  await page.getByRole("link", { name: /Bayar · Rp 20\.790/ }).click();
  await page.getByRole("button", { name: "QRIS", exact: true }).click();
  const created = page.waitForResponse((r) => r.url().endsWith("/payments/qris") && r.request().method() === "POST");
  await page.getByRole("button", { name: "QR dinamis" }).click();
  const chargeId: string = (await (await created).json()).data.id;
  await expect(page.getByRole("img", { name: /QR pembayaran/ })).toBeVisible();

  // The customer pays: the fake gateway sends its signed notification to the API.
  const paid = await request.post(`${API_URL}/gateway/fake/pay/fake_${chargeId}`);
  expect(paid.ok()).toBe(true);
  await expect(page.getByText(`QRIS · ${chargeId}`)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Selesaikan" }).click();
  const receiptNo = (await page.getByRole("dialog").getByText(/^JKT01A-\d{6}-0001$/).textContent())!;

  const businessDate = `20${receiptNo.slice(7, 9)}-${receiptNo.slice(9, 11)}-${receiptNo.slice(11, 13)}`;
  await expect
    .poll(
      async () =>
        (await call(request, "get", `/orders?outlet_id=${tenant.outletId}&business_date=${businessDate}`, tenant.token)).map(
          (o: { receipt_no: string; total: number; flags: string[] }) => [o.receipt_no, o.total, o.flags],
        ),
      { timeout: 30_000 },
    )
    .toEqual([[receiptNo, 20_790, []]]);
});

// Fase 6 DoD (ADR-023): a cashier voids one sale and refunds another offline with a manager's PIN,
// closes the shift, goes online — the server stores both corrections without flags.
test("a void and a refund made offline reach the server without flags", async ({ page, context, request }) => {
  const tenant = await tenantWithMenu(request);
  await call(request, "post", "/users", tenant.token, {
    name: "Bu Ani",
    pin: "1357",
    email: `ani-${Date.now()}@e2e.test`,
    password: "rahasia-123",
    assignments: [{ role: "manager", scope_type: "outlet", outlet_id: tenant.outletId }],
    outlets: [],
  });

  await page.goto("/");
  await page.getByLabel("Email").fill(tenant.owner.email);
  await page.getByLabel("Password").fill(tenant.owner.password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.getByRole("button", { name: "Aktifkan" }).click();
  await page.getByRole("button", { name: /Rina/ }).click();
  for (const digit of "2468") await page.getByRole("button", { name: digit, exact: true }).click();
  await page.getByRole("button", { name: "Buka Shift" }).click();
  await context.setOffline(true);

  const receipts: string[] = [];
  for (let i = 0; i < 2; i++) {
    await page.getByRole("link", { name: "Jual" }).click();
    await page.getByRole("button", { name: /Kopi Susu E2E/ }).click();
    await page.getByRole("link", { name: /Bayar · Rp 20\.790/ }).click();
    await page.getByRole("button", { name: "Rp 20.790" }).click();
    await page.getByRole("button", { name: "Selesaikan" }).click();
    receipts.push((await page.getByRole("dialog").getByText(/^JKT01A-\d{6}-\d{4}$/).textContent())!);
    await page.getByRole("dialog").getByRole("button", { name: "Pesanan Baru" }).click();
  }
  const approve = async () => {
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Manajer yang menyetujui").selectOption({ label: "Bu Ani" });
    await dialog.getByLabel("PIN manajer").fill("1357");
    await dialog.getByRole("button", { name: "Setujui" }).click();
  };
  await page.getByRole("link", { name: "Riwayat" }).click();
  await page.getByRole("button", { name: new RegExp(receipts[0]!) }).click();
  await page.getByRole("button", { name: "Void" }).click();
  await page.getByRole("dialog").getByLabel("Alasan").selectOption("Salah input");
  await approve();
  await page.getByRole("button", { name: "Void transaksi" }).click();
  await page.getByRole("button", { name: new RegExp(receipts[1]!) }).click();
  await page.getByRole("button", { name: "Refund", exact: true }).click();
  await page.getByRole("button", { name: "Tambah Kopi Susu E2E" }).click();
  await page.getByRole("dialog").getByLabel("Alasan").selectOption("Pelanggan batal");
  await approve();
  await page.getByRole("button", { name: "Refund Rp 20.790" }).click();
  await expect(page.getByRole("button", { name: new RegExp(receipts[1]!) })).toContainText("REFUND PENUH");

  await context.setOffline(false);
  const businessDate = `20${receipts[0]!.slice(7, 9)}-${receipts[0]!.slice(9, 11)}-${receipts[0]!.slice(11, 13)}`;
  await expect
    .poll(
      async () => {
        const orders = await call(request, "get", `/orders?outlet_id=${tenant.outletId}&business_date=${businessDate}`, tenant.token);
        const refunds = await call(request, "get", `/refunds?outlet_id=${tenant.outletId}&business_date=${businessDate}`, tenant.token);
        return [
          orders.map((o: { receipt_no: string; status: string; flags: string[] }) => [o.receipt_no, o.status, o.flags]),
          refunds.map((r: { total: number; flags: string[] }) => [r.total, r.flags]),
        ];
      },
      { timeout: 30_000 },
    )
    .toEqual([
      [
        [receipts[0], "voided", []],
        [receipts[1], "paid", []],
      ],
      [[20_790, []]],
    ]);
});
