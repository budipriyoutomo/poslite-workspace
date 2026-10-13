import { expect, test } from "@playwright/test";

import { signUp, uniq } from "./support";

// Fase 6a exit (ADR-022): an owner adds a second brand with its own outlet and manager; the
// manager signs in and sees only that brand.
test("owner adds a brand, its outlet and a brand manager who sees only that brand", async ({ page }) => {
  const id = uniq();
  await signUp(page, id);
  const nav = page.getByRole("navigation");

  await nav.getByRole("link", { name: "Brand" }).click();
  await page.getByRole("button", { name: "Tambah brand" }).click();
  const brandDialog = page.getByRole("dialog");
  await brandDialog.getByLabel("Kode").fill("SUSHI");
  await brandDialog.getByLabel("Nama brand").fill("Maharasa Sushi");
  await brandDialog.getByLabel("Header struk").fill("Maharasa Sushi");
  await brandDialog.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByRole("cell", { name: "SUSHI", exact: true })).toBeVisible();

  await page.getByRole("banner").getByLabel("Brand").selectOption({ label: "Maharasa Sushi" });
  await nav.getByRole("link", { name: "Outlet, Meja & Perangkat" }).click();
  await page.getByRole("button", { name: "Tambah outlet" }).click();
  const outletDialog = page.getByRole("dialog");
  await outletDialog.getByLabel("Kode").fill("BDG01");
  await outletDialog.getByLabel("Nama outlet").fill("Sushi Dago");
  await outletDialog.getByRole("button", { name: "Buat outlet" }).click();
  await expect(page.getByRole("combobox", { name: "Outlet" })).toContainText("Sushi Dago");

  await nav.getByRole("link", { name: "Pengguna" }).click();
  await page.getByRole("button", { name: "Tambah pengguna" }).click();
  const userDialog = page.getByRole("dialog");
  await userDialog.getByLabel("Nama").fill("Rina");
  await userDialog.getByLabel("Peran 1").selectOption("manager");
  await userDialog.getByLabel("Cakupan 1").selectOption({ label: "Brand Maharasa Sushi" });
  await userDialog.getByLabel("Email").fill(`rina-${id}@kopi.id`);
  await userDialog.getByLabel("Password").fill("rahasia-123");
  await userDialog.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Manajer · Brand Maharasa Sushi")).toBeVisible();

  await page.getByRole("button", { name: "Keluar" }).click();
  await page.getByLabel("Email").fill(`rina-${id}@kopi.id`);
  await page.getByLabel("Password").fill("rahasia-123");
  await page.getByRole("button", { name: "Masuk" }).click();

  const header = page.getByRole("banner");
  await expect(header.getByText("Maharasa Sushi")).toBeVisible(); // one brand: no picker
  await expect(header.getByLabel("Brand")).toHaveCount(0);
  await expect(header.getByRole("combobox", { name: "Outlet" })).toContainText("Sushi Dago");
  await expect(nav.getByRole("link", { name: "Menu" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Pengguna" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Brand" })).toHaveCount(0);
});
