import { expect, type Page, test } from "@playwright/test";

// Fase 1 DoD: open shift → sell → pay → receipt with no internet; data survives a reload.

async function logIn(page: Page, name: string, pin: string) {
  await page.getByRole("button", { name: new RegExp(name) }).click();
  for (const digit of pin) await page.getByRole("button", { name: digit, exact: true }).click();
}

test("sell and pay offline, then find the order after a reload", async ({ page, context }) => {
  await page.goto("/");
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15_000 });
  await page.getByRole("button", { name: "Coba mode demo (tanpa server)" }).click();

  await logIn(page, "Siti", "1234");
  await expect(page).toHaveURL(/\/shift$/); // no open shift yet → the guard sends the cashier here
  for (const key of ["2", "00", "000"]) await page.getByRole("button", { name: key, exact: true }).click();
  await expect(page.getByRole("status", { name: "Modal awal" })).toHaveText("Rp 200.000");
  await page.getByRole("button", { name: "Buka Shift" }).click();
  await expect(page).toHaveURL(/\/sell$/);

  await context.setOffline(true);
  await expect(page.getByText("Offline", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Es Teh Manis/ }).click();
  await page.getByRole("radio", { name: "Less Sugar" }).click();
  await page.getByRole("button", { name: /^Tambah ·/ }).click();
  await page.getByRole("button", { name: /Nasi Gudeg/ }).click();
  await page.getByRole("checkbox", { name: "Tambah Ayam" }).click();
  await page.getByRole("button", { name: /^Tambah ·/ }).click();

  // 5.000 + 35.000 = 40.000; service 5% 2.000; PB1 10% 4.200 → 46.200
  const pay = page.getByRole("link", { name: /Bayar · Rp 46\.200/ });
  await expect(pay).toBeVisible();
  await pay.click();

  await page.getByRole("button", { name: "Rp 50.000" }).click();
  await expect(page.getByRole("status", { name: "Ringkasan pembayaran" })).toContainText("Rp 3.800");
  await page.getByRole("button", { name: "Selesaikan" }).click();

  const done = page.getByRole("dialog", { name: "Transaksi berhasil" });
  await expect(done).toBeVisible();
  const receiptNo = (await done.getByText(/^JKT01A-\d{6}-0001$/).textContent())!;
  await expect(done.getByLabel("Pratinjau struk")).toContainText("TOTAL                     46.200");
  await done.getByRole("button", { name: "Pesanan Baru" }).click();
  await expect(page).toHaveURL(/\/sell$/);
  await expect(page.getByRole("button", { name: /Es Teh Manis/ })).toBeVisible();

  // Reload with no network: the app comes back from the service worker with the cashier still logged in.
  await page.reload();
  await expect(page.getByText("Siti", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Riwayat" }).click();
  const row = page.getByRole("button", { name: new RegExp(receiptNo) });
  await expect(row).toContainText("Pending");
  await expect(row).toContainText("Rp 46.200");
});
