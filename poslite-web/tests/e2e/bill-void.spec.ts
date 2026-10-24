import { expect, type Page, test } from "@playwright/test";

import { expectOrderEmpty, openOrder } from "./layout";

// P0-1 (ADR-028): what the kitchen already had leaves an open bill only with a reason and a
// manager's PIN — taking one unit off, then cancelling the whole bill — all offline.

async function logIn(page: Page, name: string, pin: string) {
  await page.getByRole("button", { name: new RegExp(name) }).click();
  for (const digit of pin) await page.getByRole("button", { name: digit, exact: true }).click();
}

async function addGudeg(page: Page) {
  await page.getByRole("button", { name: /^Nasi Gudeg/ }).click();
  const add = page.getByRole("button", { name: /^Tambah ·/ });
  if (await add.isVisible()) {
    const firstRadio = page.getByRole("radio").first();
    if (await firstRadio.isVisible()) await firstRadio.click();
    await add.click();
  }
}

async function approveVoid(page: Page, reason: string) {
  const dialog = page.getByRole("dialog", { name: /^Batalkan item meja/ });
  await dialog.getByLabel("Alasan").selectOption(reason);
  await dialog.getByLabel("Manajer yang menyetujui").selectOption({ label: "Budi" });
  await dialog.getByLabel("PIN manajer").fill("9999");
  await dialog.getByRole("button", { name: "Setujui" }).click();
  await expect(dialog.getByText("Disetujui Budi")).toBeVisible();
  await dialog.getByRole("button", { name: "Batalkan item" }).click();
  await expect(dialog).toHaveCount(0);
}

const queuedBillVoids = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open("poslite");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const all = open.result.transaction("outbox").objectStore("outbox").getAll();
          all.onsuccess = () => resolve((all.result as { type: string }[]).filter((e) => e.type === "bill.item_voided").length);
          all.onerror = () => reject(all.error);
        };
      }),
  );

test("take a sent item off a bill, then cancel the bill, each with a manager's PIN, offline", async ({ page, context }) => {
  await page.goto("/");
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15_000 });
  await page.getByRole("button", { name: "Coba mode demo (tanpa server)" }).click();
  await logIn(page, "Siti", "1234");
  await page.getByRole("button", { name: "Buka Shift" }).click();
  await expect(page).toHaveURL(/\/sell$/);
  await context.setOffline(true);

  // Two Nasi Gudeg for table A1 go to the kitchen when the bill is saved
  await addGudeg(page);
  await addGudeg(page);
  await openOrder(page);
  await page.getByRole("button", { name: "Makan di tempat" }).click();
  await page.getByRole("button", { name: /A1/ }).click();
  await page.getByRole("button", { name: "Simpan bill" }).click();
  await expectOrderEmpty(page);

  // The guest drops one: saving asks for a reason and a manager's PIN
  await page.getByRole("link", { name: "Bill" }).click();
  await page.getByRole("button", { name: "Lanjutkan A1" }).click();
  await openOrder(page);
  await expect(page.getByText("2 sudah ke dapur")).toBeVisible();
  await page.getByRole("button", { name: "Kurangi jumlah Nasi Gudeg" }).click();
  await page.getByRole("button", { name: "Simpan bill" }).click();
  await expect(page.getByRole("dialog", { name: /^Batalkan item meja A1/ })).toContainText("1x Nasi Gudeg");
  await approveVoid(page, "Pelanggan batal");
  await expectOrderEmpty(page);

  await page.getByRole("link", { name: "Bill" }).click();
  await expect(page.getByRole("listitem", { name: "Meja A1" })).toContainText("1 item");

  // Then the table leaves: cancelling the bill needs the same approval
  await page.getByRole("button", { name: "Batalkan A1" }).click();
  await approveVoid(page, "Salah input");
  await expect(page.getByText("Tidak ada bill terbuka")).toBeVisible();

  expect(await queuedBillVoids(page)).toBe(2);
});
