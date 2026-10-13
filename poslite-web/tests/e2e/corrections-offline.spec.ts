import { expect, type Page, test } from "@playwright/test";

// Fase 6b (ADR-023): a cashier voids a sale and refunds another one with a manager's PIN, all
// offline; the shift's expected cash follows both.

async function logIn(page: Page, name: string, pin: string) {
  await page.getByRole("button", { name: new RegExp(name) }).click();
  for (const digit of pin) await page.getByRole("button", { name: digit, exact: true }).click();
}

async function sellGudeg(page: Page) {
  await page.getByRole("link", { name: "Jual" }).click();
  await page.getByRole("button", { name: /Nasi Gudeg/ }).click();
  await page.getByRole("checkbox", { name: "Tambah Ayam" }).click();
  await page.getByRole("button", { name: /^Tambah ·/ }).click();
  // 35.000 + service 1.750 + PB1 3.675 = 40.425
  await page.getByRole("link", { name: /Bayar · Rp 40\.425/ }).click();
  await page.getByRole("button", { name: "Rp 50.000" }).click();
  await page.getByRole("button", { name: "Selesaikan" }).click();
  const done = page.getByRole("dialog", { name: "Transaksi berhasil" });
  const receiptNo = (await done.getByText(/^JKT01A-\d{6}-\d{4}$/).textContent())!;
  await done.getByRole("button", { name: "Pesanan Baru" }).click();
  return receiptNo;
}

async function approve(page: Page) {
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Manajer yang menyetujui").selectOption({ label: "Budi" });
  await dialog.getByLabel("PIN manajer").fill("9999");
  await dialog.getByRole("button", { name: "Setujui" }).click();
  await expect(dialog.getByText("Disetujui Budi")).toBeVisible();
}

test("void and refund offline with a manager's PIN; the drawer adds up", async ({ page, context }) => {
  await page.goto("/");
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15_000 });
  await page.getByRole("button", { name: "Coba mode demo (tanpa server)" }).click();
  await logIn(page, "Siti", "1234");
  for (const key of ["2", "00", "000"]) await page.getByRole("button", { name: key, exact: true }).click();
  await page.getByRole("button", { name: "Buka Shift" }).click();
  await context.setOffline(true);

  const voided = await sellGudeg(page);
  const refunded = await sellGudeg(page);
  await page.getByRole("link", { name: "Riwayat" }).click();

  await page.getByRole("button", { name: new RegExp(voided) }).click();
  await page.getByRole("button", { name: "Void" }).click();
  await page.getByRole("dialog").getByLabel("Alasan").selectOption("Salah input");
  await approve(page);
  await page.getByRole("button", { name: "Void transaksi" }).click();
  await expect(page.getByRole("button", { name: new RegExp(voided) })).toContainText("VOID");

  await page.getByRole("button", { name: new RegExp(refunded) }).click();
  await page.getByRole("button", { name: "Refund", exact: true }).click();
  await page.getByRole("button", { name: "Tambah Nasi Gudeg" }).click();
  await page.getByRole("dialog").getByLabel("Alasan").selectOption("Pelanggan batal");
  await approve(page);
  await page.getByRole("button", { name: "Refund Rp 40.425" }).click();
  await expect(page.getByRole("button", { name: new RegExp(refunded) })).toContainText("REFUND PENUH");

  // 200.000 opening + 2 × 50.000 − 2 × 9.575 change − 40.425 voided sale − 40.425 refunded
  await page.getByRole("link", { name: "Shift" }).click();
  await expect(page.getByText("Rp 200.000").last()).toBeVisible();
  await expect(page.getByRole("status", { name: "Koreksi" })).toHaveText("Void 1 (Rp 40.425) · Refund 1 (Rp 40.425)");
});
