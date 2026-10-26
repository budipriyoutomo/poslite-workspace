import { expect, type Page, test } from "@playwright/test";

import { expectOrderEmpty, openOrder, expectToastClear } from "./layout";

// Fase 4 DoD (ADR-015) and 15 · UX-04: open a table's bill, add to it later, then guests pay
// separately by item — all offline, with the table's status on the table screen.

async function logIn(page: Page, name: string, pin: string) {
  await page.getByRole("button", { name: new RegExp(name) }).click();
  for (const digit of pin) await page.getByRole("button", { name: digit, exact: true }).click();
}

async function addPlain(page: Page, product: RegExp) {
  await page.getByRole("button", { name: product }).click();
  const add = page.getByRole("button", { name: /^Tambah ·/ });
  // Wait briefly for the options dialog: an instant isVisible() can run before it opens.
  const hasOptions = await add.waitFor({ state: "visible", timeout: 2_000 }).then(() => true, () => false);
  if (hasOptions) {
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

  // A1 starts empty on the table screen (15 · UX-04)
  await page.getByRole("link", { name: "Meja" }).click();
  await expect(page.getByRole("button", { name: /^Meja A1/ })).toHaveAttribute("data-state", "empty");
  await page.getByRole("link", { name: "Jual" }).click();

  // First round for table A1, for two guests, kept open
  await addPlain(page, /^Nasi Gudeg/);
  await addPlain(page, /^Nasi Gudeg/);
  await openOrder(page);
  await page.getByRole("button", { name: "Makan di tempat" }).click();
  await page.getByRole("button", { name: /A1/ }).click();
  await expect(page.getByText("Meja A1").first()).toBeVisible();
  await page.getByRole("button", { name: "Tambah tamu" }).click();
  await page.getByRole("button", { name: "Tambah tamu" }).click();
  await page.getByRole("button", { name: "Kirim ke dapur (2 baru)" }).click();
  await expectToastClear(page, "Bill meja A1 disimpan");
  await expectOrderEmpty(page);

  // A1 is now occupied, with its guests
  await page.getByRole("link", { name: "Meja" }).click();
  const a1 = page.getByRole("button", { name: /^Meja A1/ });
  await expect(a1).toHaveAttribute("data-state", "occupied");
  await expect(a1).toHaveAccessibleName(/2 tamu/);

  // The guests change tables (A1 → A2) and back again: the bill follows, offline (doc 11 §2)
  await a1.click();
  await page.getByRole("button", { name: "Pindah meja" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /A2/ }).click();
  await expect(page.getByRole("button", { name: /^Meja A2/ })).toHaveAttribute("data-state", "occupied");
  await expect(page.getByRole("button", { name: /^Meja A1/ })).toHaveAttribute("data-state", "empty");
  await page.getByRole("button", { name: /^Meja A2/ }).click();
  await page.getByRole("button", { name: "Pindah meja" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /A1/ }).click();

  // Later: add a drink to the bill
  await page.getByRole("button", { name: /^Meja A1/ }).click();
  await expect(page.getByRole("listitem", { name: "2× Nasi Gudeg" })).toBeVisible();
  await page.getByRole("button", { name: "Tambah pesanan" }).click();
  await expect(page).toHaveURL(/\/sell$/);
  await addPlain(page, /^Es Teh Manis/);
  await openOrder(page);
  // 15 · UX-06: the bill's lines say what the kitchen has and what is new.
  await expect(page.getByText("Di dapur 2")).toBeVisible();
  await expect(page.getByText("Baru 1")).toBeVisible();
  await page.getByRole("button", { name: "Kirim ke dapur (1 baru)" }).click();
  await expectOrderEmpty(page);

  // Guest 1 pays one Nasi Gudeg ("Pisah bill"); the rest stays open
  await page.getByRole("link", { name: "Meja" }).click();
  await page.getByRole("button", { name: /^Meja A1/ }).click();
  await page.getByRole("button", { name: "Pisah bill" }).click();
  await page.getByRole("button", { name: "Tambah Nasi Gudeg dibayar" }).click();
  await page.getByRole("button", { name: "Rp 50.000" }).first().click();
  await page.getByRole("button", { name: "Selesaikan" }).click();
  const done = page.getByRole("dialog", { name: "Transaksi berhasil" });
  await expect(done.getByLabel("Pratinjau struk")).toContainText("Meja : A1");
  await expect(done.getByLabel("Pratinjau struk")).toContainText("1x Nasi Gudeg");
  await done.getByRole("button", { name: "Pesanan Baru" }).click();

  await page.getByRole("link", { name: "Meja" }).click();
  await page.getByRole("button", { name: /^Meja A1/ }).click();
  await expect(page.getByRole("listitem", { name: "1× Nasi Gudeg" })).toBeVisible();

  // Guest 2 pays the rest: the bill closes and A1 is empty again
  await page.getByRole("button", { name: "Bayar", exact: true }).click();
  await page.getByRole("button", { name: "Rp 50.000" }).first().click();
  await page.getByRole("button", { name: "Selesaikan" }).click();
  await page.getByRole("dialog", { name: "Transaksi berhasil" }).getByRole("button", { name: "Pesanan Baru" }).click();
  await page.getByRole("link", { name: "Meja" }).click();
  await expect(page.getByRole("button", { name: /^Meja A1/ })).toHaveAttribute("data-state", "empty");
});
