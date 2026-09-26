import { expect, test } from "@playwright/test";

import { signUp, uniq } from "./support";

// Fase 3 exit: an owner sets up the business from the back-office against the real API.
test("owner sets up menu, outlet price, cashier, payment method and outlet rates", async ({ page }) => {
  await signUp(page, uniq());
  const nav = page.getByRole("navigation");

  await nav.getByRole("link", { name: "Menu" }).click();
  await page.getByRole("tab", { name: "Kategori" }).click();
  await page.getByLabel("Nama kategori baru").fill("Minuman");
  await page.getByRole("button", { name: "Tambah" }).click();
  await expect(page.getByText("Minuman")).toBeVisible();

  await page.getByRole("tab", { name: "Produk" }).click();
  await page.getByRole("button", { name: "Tambah produk" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nama").fill("Es Teh Manis");
  await dialog.getByLabel("SKU").fill("MN-001");
  await dialog.getByLabel("Harga").fill("5000");
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByRole("cell", { name: "Rp 5.000" })).toBeVisible();

  await nav.getByRole("link", { name: "Harga Outlet" }).click();
  await page.getByLabel("Harga di outlet Es Teh Manis").fill("6000");
  await page.getByRole("button", { name: "Simpan" }).click();
  await page.reload();
  await expect(page.getByLabel("Harga di outlet Es Teh Manis")).toHaveValue("6.000");

  await nav.getByRole("link", { name: "Pengguna" }).click();
  await page.getByRole("button", { name: "Tambah pengguna" }).click();
  const userDialog = page.getByRole("dialog");
  await userDialog.getByLabel("Nama").fill("Siti");
  await userDialog.getByRole("checkbox", { name: "Kemang" }).click();
  await userDialog.getByLabel("PIN").fill("1234");
  await userDialog.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByRole("cell", { name: "Siti", exact: true })).toBeVisible();

  await nav.getByRole("link", { name: "Metode Bayar" }).click();
  await page.getByLabel("Nama metode baru").fill("QRIS BCA");
  await page.getByRole("button", { name: "Tambah" }).click();
  await expect(page.getByRole("listitem", { name: "QRIS BCA" })).toBeVisible();

  await nav.getByRole("link", { name: "Outlet & Perangkat" }).click();
  await page.getByLabel("Pajak (%)").fill("11");
  await page.getByRole("button", { name: "Simpan pengaturan" }).click();
  await expect(page.getByText("Pengaturan disimpan")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Pajak (%)")).toHaveValue("11");
  await expect(page.getByText("Belum ada perangkat.")).toBeVisible();
});
