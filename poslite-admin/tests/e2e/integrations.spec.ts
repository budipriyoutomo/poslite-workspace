import { expect, test } from "@playwright/test";

import { signUp, uniq } from "./support";

// ADR-020: an owner registers a webhook endpoint; the signing secret is shown once.
test("owner adds a webhook and sees its secret once", async ({ page }) => {
  await signUp(page, uniq());

  await page.getByRole("navigation").getByRole("link", { name: "Integrasi" }).click();
  await page.getByLabel("URL webhook").fill("https://erp.example.com/poslite");
  await page.getByRole("checkbox", { name: "shift.closed" }).click();
  await page.getByRole("button", { name: "Tambah webhook" }).click();

  await expect(page.getByRole("status")).toContainText("tidak akan ditampilkan lagi");
  const row = page.getByRole("listitem").filter({ hasText: "https://erp.example.com/poslite" });
  await expect(row).toContainText("order.placed, shift.closed");

  await page.reload();
  await expect(page.getByRole("status")).toBeHidden();
  await expect(row).toBeVisible();
});
