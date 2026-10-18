import { expect, type Page, test } from "@playwright/test";

// Phone-only steps of the cashier flows (poslite-docs/12-responsive-ui.md): on a phone the order sits in
// a drawer behind "Lihat pesanan", receipts open in a sheet and checkout folds the order details.
// On tablets and desktops these are no-ops, so one spec covers every layout.

const isPhone = () => test.info().project.name === "phone";

/** Make the order (lines, dine-in bar, Bayar) reachable. */
export async function openOrder(page: Page) {
  if (isPhone()) await page.getByRole("button", { name: /Lihat pesanan/ }).click();
}

/** Close a phone sheet (order drawer, receipt) so the screen behind it can be used. */
export async function closeSheet(page: Page) {
  if (!isPhone()) return;
  // Tap the sheet's own close button, as a phone user would, once any dialog opened from it is gone.
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.getByRole("dialog").getByRole("button", { name: "Tutup" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

/** The order is empty: no "Lihat pesanan" bar on a phone, the empty cart panel elsewhere. */
export async function expectOrderEmpty(page: Page) {
  if (isPhone()) await expect(page.getByRole("button", { name: /Lihat pesanan/ })).toHaveCount(0);
  else await expect(page.getByText("Keranjang kosong").first()).toBeVisible();
}

/** Unfold the order details on the checkout page (discount, totals). */
export async function showOrderDetails(page: Page) {
  if (isPhone()) await page.getByRole("button", { name: /Rincian pesanan/ }).click();
}
