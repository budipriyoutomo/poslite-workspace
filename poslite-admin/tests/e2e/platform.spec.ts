import { expect, test } from "@playwright/test";

import { API_ORIGIN } from "../../playwright.config";
import { createOperator, uniq } from "./support";

test("operator suspends a tenant: back-office writes stop until reactivated", async ({ page, request }) => {
  const id = uniq();
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
  const owner = { Authorization: `Bearer ${(await signup.json()).data.token}` };
  const addCategory = () => request.post(`${API_ORIGIN}/api/v1/categories`, { headers: owner, data: { name: `Makanan ${Date.now()}`, sort_order: 0, color: "", print_role: "kitchen" } });

  createOperator(`ops-${id}@poslite.id`, "operator-rahasia-123");
  await page.goto("/platform");
  await page.getByLabel("Email").fill(`ops-${id}@poslite.id`);
  await page.getByLabel("Password").fill("operator-rahasia-123");
  await page.getByRole("button", { name: "Masuk" }).click();

  const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: `Warung ${id}` }) });
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
