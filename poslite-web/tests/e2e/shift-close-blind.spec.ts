import { expect, type Page, test } from "@playwright/test";

// 15 · UX-02: a cashier closes the shift by counting the drawer per denomination, without ever
// seeing the expected cash or the variance, offline.

async function logIn(page: Page, name: string, pin: string) {
  await page.getByRole("button", { name: new RegExp(name) }).click();
  for (const digit of pin) await page.getByRole("button", { name: digit, exact: true }).click();
}

test("a cashier closes the shift blind, counting per denomination", async ({ page, context }) => {
  await page.goto("/");
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15_000 });
  await page.getByRole("button", { name: "Coba mode demo (tanpa server)" }).click();
  await logIn(page, "Siti", "1234");
  await page.getByRole("button", { name: "Buka Shift" }).click();
  await expect(page).toHaveURL(/\/sell$/);
  await context.setOffline(true);

  await page.goto("/shift");
  await expect(page.getByText("Modal awal")).toBeVisible();
  await expect(page.getByText("Seharusnya di laci")).toHaveCount(0);

  await page.getByRole("button", { name: "Tutup Shift" }).click();
  const dialog = page.getByRole("dialog", { name: "Tutup Shift" });
  await dialog.getByLabel("Lembar Rp 50.000").fill("1");
  await dialog.getByLabel("Total koin").fill("500");
  await expect(dialog.getByRole("status", { name: "Total dihitung" })).toHaveText(/Rp 50\.500/);
  await expect(dialog.getByText(/Seharusnya|Selisih/)).toHaveCount(0);
  await dialog.getByRole("button", { name: "Tutup Shift" }).click();

  await expect(page.getByText("Shift ditutup")).toBeVisible();
  await expect(page.getByRole("button", { name: "Buka Shift" })).toBeVisible();
});
