import { expect, type Page, test } from "@playwright/test";

import { openOrder, showOrderDetails } from "./layout";

// 06 Order rule 5: a cashier's discount over the brand limit (default 20%) needs a manager's PIN,
// offline; the sale goes through once approved.

async function logIn(page: Page, name: string, pin: string) {
  await page.getByRole("button", { name: new RegExp(name) }).click();
  for (const digit of pin) await page.getByRole("button", { name: digit, exact: true }).click();
}

test("a discount over the cashier limit waits for a manager's PIN", async ({ page, context }) => {
  await page.goto("/");
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15_000 });
  await page.getByRole("button", { name: "Coba mode demo (tanpa server)" }).click();
  await logIn(page, "Siti", "1234");
  for (const key of ["2", "00", "000"]) await page.getByRole("button", { name: key, exact: true }).click();
  await page.getByRole("button", { name: "Buka Shift" }).click();
  await context.setOffline(true);

  await page.getByRole("button", { name: /Nasi Gudeg/ }).click();
  await page.getByRole("button", { name: /^Tambah ·/ }).click();
  await openOrder(page);
  await page.getByRole("link", { name: /^Bayar ·/ }).click();
  await showOrderDetails(page);
  await page.getByRole("button", { name: "Diskon", exact: true }).click();
  await page.getByLabel("Diskon lain").fill("25");
  await page.getByRole("button", { name: "Pakai %" }).click();

  const approval = page.getByRole("group", { name: "Persetujuan diskon" });
  await expect(approval).toBeVisible();
  await expect(page.getByRole("button", { name: "Selesaikan" })).toHaveCount(0);
  await approval.getByLabel("Manajer yang menyetujui").selectOption({ label: "Budi" });
  await approval.getByLabel("PIN manajer").fill("9999");
  await approval.getByRole("button", { name: "Setujui" }).click();
  await expect(approval.getByText("Disetujui Budi")).toBeVisible();

  await page.getByRole("button", { name: /^Rp / }).first().click();
  await page.getByRole("button", { name: "Selesaikan" }).click();
  await expect(page.getByRole("dialog", { name: "Transaksi berhasil" })).toBeVisible();
});
