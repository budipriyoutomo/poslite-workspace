import { expect, type Page, test } from "@playwright/test";

import { expectOrderEmpty, openOrder } from "./layout";

// Fase 4 DoD (ADR-015): open a table's bill, add to it later, then guests pay separately by item — all offline.

async function logIn(page: Page, name: string, pin: string) {
  await page.getByRole("button", { name: new RegExp(name) }).click();
  for (const digit of pin) await page.getByRole("button", { name: digit, exact: true }).click();
}

async function addPlain(page: Page, product: RegExp) {
  await page.getByRole("button", { name: product }).click();
  const add = page.getByRole("button", { name: /^Tambah ·/ });
  if (await add.isVisible()) {
    const firstRadio = page.getByRole("radio").first();
    if (await firstRadio.isVisible()) await firstRadio.click();
    await add.click();
  }
}

test("keep a table's bill open, add to it, then split the payment by item offline", async ({ page, context }) => {
  await page.goto("/");
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15_000 });
  await page.getByRole("button", { name: "Coba mode demo (tanpa server)" }).click();
  await logIn(page, "Siti", "1234");
  await page.getByRole("button", { name: "Buka Shift" }).click();
  await expect(page).toHaveURL(/\/sell$/);
  await context.setOffline(true);

  // First round for table A1, kept open
  await addPlain(page, /^Nasi Gudeg/);
  await addPlain(page, /^Nasi Gudeg/);
  await openOrder(page);
  await page.getByRole("button", { name: "Makan di tempat" }).click();
  await page.getByRole("button", { name: /A1/ }).click();
  await expect(page.getByText("Meja A1").first()).toBeVisible();
  await page.getByRole("button", { name: "Simpan bill" }).click();
  await expectOrderEmpty(page);

  // The guests change tables (A1 → A2) and back again: the bill follows, offline (doc 11 §2)
  await page.getByRole("link", { name: "Bill" }).click();
  await page.getByRole("button", { name: "Pindah meja A1" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /A2/ }).click();
  await expect(page.getByRole("listitem", { name: "Meja A2" })).toContainText("2 item");
  await page.getByRole("button", { name: "Pindah meja A2" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /A1/ }).click();

  // Later: resume the bill and add a drink
  await expect(page.getByRole("listitem", { name: "Meja A1" })).toContainText("2 item");
  await page.getByRole("button", { name: "Lanjutkan A1" }).click();
  await expect(page).toHaveURL(/\/sell$/);
  await addPlain(page, /^Es Teh Manis/);
  await openOrder(page);
  await page.getByRole("link", { name: /^Bayar ·/ }).first().click();

  // Guest 1 pays one Nasi Gudeg; the rest stays open
  await page.getByRole("button", { name: "Pisah per item" }).click();
  await page.getByRole("button", { name: "Tambah Nasi Gudeg dibayar" }).click();
  await page.getByRole("button", { name: "Rp 50.000" }).first().click();
  await page.getByRole("button", { name: "Selesaikan" }).click();
  const done = page.getByRole("dialog", { name: "Transaksi berhasil" });
  await expect(done.getByLabel("Pratinjau struk")).toContainText("Meja : A1");
  await expect(done.getByLabel("Pratinjau struk")).toContainText("1x Nasi Gudeg");
  await done.getByRole("button", { name: "Pesanan Baru" }).click();

  await page.getByRole("link", { name: "Bill" }).click();
  await expect(page.getByRole("listitem", { name: "Meja A1" })).toContainText("2 item");

  // Guest 2 pays the rest: the bill closes
  await page.getByRole("button", { name: "Lanjutkan A1" }).click();
  await openOrder(page);
  await page.getByRole("link", { name: /^Bayar ·/ }).first().click();
  await page.getByRole("button", { name: "Rp 50.000" }).first().click();
  await page.getByRole("button", { name: "Selesaikan" }).click();
  await page.getByRole("dialog", { name: "Transaksi berhasil" }).getByRole("button", { name: "Pesanan Baru" }).click();
  await page.getByRole("link", { name: "Bill" }).click();
  await expect(page.getByText("Tidak ada bill terbuka")).toBeVisible();
});
