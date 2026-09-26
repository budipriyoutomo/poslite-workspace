import { type APIRequestContext, expect, test } from "@playwright/test";

import { API_URL } from "../../playwright.fullstack.config";

// Fase 2 DoD in a browser: a real device is activated against the real API, sells with no
// network, and the sale reaches the server once it is back online.

const OWNER = { email: `owner-${Date.now()}@e2e.test`, password: "rahasia-123" };

async function call(api: APIRequestContext, method: "get" | "post" | "put", path: string, token?: string, data?: unknown) {
  const response = await api[method](`${API_URL}${path}`, { data, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBe(true);
  return (await response.json()).data;
}

async function tenantWithMenu(api: APIRequestContext) {
  const signup = await call(api, "post", "/tenants/signup", undefined, {
    business_name: "Warung E2E",
    slug: `e2e-${Date.now()}`,
    owner_name: "Budi",
    ...OWNER,
    outlet: { code: "JKT01", name: "Outlet E2E", timezone: "Asia/Jakarta" },
  });
  const token: string = signup.token;
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
  return { token, outletId: outlet.id as string };
}

test("activate a device, sell offline, and the sale reaches the server", async ({ page, context, request }) => {
  const tenant = await tenantWithMenu(request);

  await page.goto("/");
  await expect(page).toHaveURL(/\/activate$/);
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.getByRole("button", { name: "Aktifkan" }).click();

  // The cashier list on the lock screen came from the server (sync pull).
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
