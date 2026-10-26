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

/**
 * 15 · UX-07: a toast never covers the screen's main controls. From a tablet up it sits above the
 * bottom 96px (checkout summary, cart buttons); on a phone it sits below the 56px header.
 */
export async function expectToastClear(page: Page, text: string | RegExp) {
  const toast = page.locator("[data-sonner-toast]").filter({ hasText: text });
  const viewport = page.viewportSize()!;
  // Polled: the toast slides in, so its box moves for a few hundred milliseconds.
  if (isPhone()) await expect.poll(async () => (await toast.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(56);
  else await expect.poll(async () => { const box = await toast.boundingBox(); return box ? box.y + box.height : Infinity; }).toBeLessThanOrEqual(viewport.height - 96);
}
