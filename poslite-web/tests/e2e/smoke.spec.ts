import { expect, test } from "@playwright/test";

test("a new device starts at activation", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/activate$/);
  await expect(page.getByRole("heading", { name: "Aktivasi Perangkat" })).toBeVisible();
});
