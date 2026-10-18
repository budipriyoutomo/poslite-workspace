import { expect, test } from "@playwright/test";

// Fase 0 PWA spike (ADR-002): once visited online, the app shell must load with no network.
test("app shell loads offline after reload", async ({ page, context }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/activate$/);
  const hasController = await page
    .waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  expect(hasController, "service worker should control the page after the first visit").toBe(true);

  await context.setOffline(true);
  await page.reload();

  await expect(page.getByRole("heading", { name: "Aktivasi Perangkat" })).toBeVisible();
});

test("web app manifest is installable (standalone, any orientation, 192/512 icons)", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest).toMatchObject({ display: "standalone", orientation: "any", start_url: "/" });
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
});
