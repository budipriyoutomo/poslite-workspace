import { expect, type Page, test } from "@playwright/test";

import { openOrder } from "./layout";

// 15 · UX-06: compact text tiles by default; a manager switches the device to photos, and a
// cashier sells in that view without seeing the switch.

async function logIn(page: Page, name: string, pin: string) {
  await page.getByRole("button", { name: new RegExp(name) }).click();
  for (const digit of pin) await page.getByRole("button", { name: digit, exact: true }).click();
}

test("a manager switches the menu to photos; the cashier sells in that view", async ({ page, context }) => {
  await page.goto("/");
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15_000 });
  await page.getByRole("button", { name: "Coba mode demo (tanpa server)" }).click();
  await logIn(page, "Budi", "9999");
  await page.getByRole("button", { name: "Buka Shift" }).click();
  await expect(page).toHaveURL(/\/sell$/);
  await context.setOffline(true);

  const gudeg = page.getByRole("button", { name: /^Nasi Gudeg/ });
  await expect(gudeg.locator("img")).toHaveCount(0);
  await page.getByRole("group", { name: "Tampilan menu" }).getByRole("button", { name: "Foto" }).click();
  await expect(gudeg.locator("img")).toHaveCount(1);

  await page.getByRole("button", { name: "Kunci" }).click();
  await page.getByRole("button", { name: "Ganti kasir" }).click();
  await logIn(page, "Siti", "1234");
  await expect(page).toHaveURL(/\/sell$/);
  await expect(page.getByRole("group", { name: "Tampilan menu" })).toHaveCount(0);
  await expect(gudeg.locator("img")).toHaveCount(1);

  await gudeg.click();
  await page.getByRole("button", { name: /^Tambah ·/ }).click();
  await openOrder(page);
  await page.getByRole("link", { name: /^Bayar ·/ }).click();
  await page.getByRole("button", { name: "Rp 50.000" }).first().click();
  await page.getByRole("button", { name: "Selesaikan" }).click();
  await expect(page.getByRole("dialog", { name: "Transaksi berhasil" })).toBeVisible();
});
