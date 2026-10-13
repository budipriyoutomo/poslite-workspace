import { expect, type Page, test } from "@playwright/test";

import { API_ORIGIN } from "../../playwright.config";
import { createOperator, uniq } from "./support";

async function signUpTenant(request: import("@playwright/test").APIRequestContext, id: string) {
  const signup = await request.post(`${API_ORIGIN}/api/v1/tenants/signup`, {
    data: {
      business_name: `Warung ${id}`,
      slug: `warung-${id}`,
      owner_name: "Tini",
      email: `tini-${id}@warung.id`,
      password: "rahasia-123",
      outlet: { code: "SBY01", name: "Darmo", timezone: "Asia/Jakarta" },
    },
  });
  expect(signup.status()).toBe(201);
  return (await signup.json()).data as { token: string };
}

async function signInOperator(page: Page, id: string) {
  createOperator(`ops-${id}@poslite.id`, "operator-rahasia-123");
  await page.goto("/");
  await page.getByLabel("Email").fill(`ops-${id}@poslite.id`);
  await page.getByLabel("Password").fill("operator-rahasia-123");
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page.getByRole("heading", { name: "Ringkasan Platform" })).toBeVisible();
}

test("operator suspends a tenant: back-office writes stop until reactivated", async ({ page, request }) => {
  const id = uniq();
  const { token } = await signUpTenant(request, id);
  const auth = { Authorization: `Bearer ${token}` };
  const access = await (await request.get(`${API_ORIGIN}/api/v1/me/access`, { headers: auth })).json();
  const owner = { ...auth, "X-Brand-Id": access.data.brands[0].id };
  const addCategory = () => request.post(`${API_ORIGIN}/api/v1/categories`, { headers: owner, data: { name: `Makanan ${Date.now()}`, sort_order: 0, color: "", print_role: "kitchen" } });

  await signInOperator(page, id);
  await page.getByRole("navigation", { name: "Navigasi konsol" }).getByRole("link", { name: "Tenant" }).click();

  const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: `Warung ${id}` }) });
  await row.getByRole("button", { name: `Tangguhkan Warung ${id}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Tangguhkan" }).click();
  await expect(row.getByText("Ditangguhkan")).toBeVisible();

  const blocked = await addCategory();
  expect(blocked.status()).toBe(403);
  expect((await blocked.json()).code).toBe("TENANT_SUSPENDED");

  await row.getByRole("button", { name: `Aktifkan Warung ${id}` }).click();
  await expect(row.getByText("Aktif", { exact: true })).toBeVisible();
  expect((await addCategory()).status()).toBe(201);
});

test("operator finds a tenant, resets the owner's password and extends the trial", async ({ page, request }) => {
  const id = uniq();
  await signUpTenant(request, id);
  await signInOperator(page, id);

  await page.getByRole("navigation", { name: "Navigasi konsol" }).getByRole("link", { name: "Tenant" }).click();
  await page.getByRole("searchbox", { name: "Cari tenant" }).fill(`tini-${id}@`);
  await page.getByRole("searchbox", { name: "Cari tenant" }).press("Enter");
  await page.getByRole("link", { name: `Warung ${id}` }).click();
  await expect(page.getByRole("heading", { name: `Warung ${id}` })).toBeVisible();

  await page.getByRole("button", { name: "Reset password Tini" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Reset password" }).click();
  const temporary = (await page.locator("code").textContent())?.trim() ?? "";
  expect(temporary.length).toBeGreaterThanOrEqual(12);
  await page.keyboard.press("Escape");

  const login = (password: string) => request.post(`${API_ORIGIN}/api/v1/auth/login`, { data: { email: `tini-${id}@warung.id`, password } });
  expect((await login("rahasia-123")).status()).toBe(401);
  expect((await login(temporary)).status()).toBe(200);

  await page.getByRole("button", { name: "Perpanjang trial" }).click();
  await page.getByLabel("Tambah hari").fill("10");
  await page.getByRole("button", { name: "Perpanjang", exact: true }).click();
  await expect(page.getByLabel("Status langganan")).toHaveText("Masa coba");

  const audit = page.getByRole("table", { name: "Audit log" });
  await expect(audit.getByText("Memperpanjang trial")).toBeVisible();
  await expect(audit.getByText("Reset password user")).toBeVisible();
});
