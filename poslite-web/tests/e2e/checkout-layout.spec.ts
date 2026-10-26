import { expect, type Page, test } from "@playwright/test";

import { openOrder } from "./layout";

// 15 · UX-03: from a tablet up, the whole cash keypad and "Selesaikan" are in view as the payment
// screen opens, so the cashier never scrolls to key an amount or to finish.

async function logIn(page: Page, name: string, pin: string) {
  await page.getByRole("button", { name: new RegExp(name) }).click();
  for (const digit of pin) await page.getByRole("button", { name: digit, exact: true }).click();
}

test("the keypad and Selesaikan are in view without scrolling", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15_000 });
  await page.getByRole("button", { name: "Coba mode demo (tanpa server)" }).click();
  await logIn(page, "Siti", "1234");
  await page.getByRole("button", { name: "Buka Shift" }).click();
  await expect(page).toHaveURL(/\/sell$/);

  await page.getByRole("button", { name: /Es Teh Manis/ }).click();
  await page.getByRole("radio").first().click();
  await page.getByRole("button", { name: /^Tambah ·/ }).click();
  await openOrder(page);
  await page.getByRole("link", { name: /^Bayar ·/ }).click();
  await expect(page).toHaveURL(/\/checkout$/);

  await expect(page.getByRole("button", { name: "Selesaikan" })).toBeInViewport({ ratio: 1 });
  // A phone keeps its stacked layout (the doc's spec): there the keypad is a short scroll away.
  if (test.info().project.name === "phone") return;
  for (const key of ["7", "000"]) await expect(page.getByRole("button", { name: key, exact: true })).toBeInViewport({ ratio: 1 });
});
