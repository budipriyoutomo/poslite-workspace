import { expect, test } from "@playwright/test";

import { runBilling, signUp, sql, uniq } from "./support";

// Fase 5 DoD (ADR-018): trial ends → invoice → unpaid past grace → suspended → paid → active again.
test("an unpaid invoice suspends the business until it is paid through the gateway", async ({ page, context }) => {
  const slug = uniq();
  await signUp(page, slug);
  const tenant = `(SELECT id FROM tenants WHERE slug = 'kopi-${slug}')`;

  runBilling(); // starts the trial
  sql(`UPDATE subscriptions SET trial_ends_at = now() - interval '10 days' WHERE tenant_id = ${tenant}`);
  runBilling(); // issues the invoice for the period that began
  sql(`UPDATE invoices SET due_at = now() - interval '1 hour' WHERE tenant_id = ${tenant}`);
  runBilling(); // past grace → suspended

  await page.getByRole("navigation").getByRole("link", { name: "Langganan" }).click();
  const unpaid = page.getByRole("alert").filter({ hasText: "Tagihan belum dibayar" }); // Next also renders a route announcer
  await expect(unpaid).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "Belum dibayar" });
  await expect(row).toContainText("1 outlet × Rp 150.000");

  const [checkout] = await Promise.all([context.waitForEvent("page"), row.getByRole("link", { name: "Bayar" }).click()]);
  await checkout.getByRole("button", { name: "Bayar" }).click();
  await expect(checkout.locator("body")).toContainText('"handled":true');

  await page.reload();
  await expect(page.getByRole("row").filter({ hasText: "Lunas" })).toBeVisible();
  await expect(unpaid).toHaveCount(0);
  await expect(page.getByText("Aktif", { exact: true })).toBeVisible();
});
