import { execFileSync } from "node:child_process";
import path from "node:path";

import { expect, type Page } from "@playwright/test";

import { API_ORIGIN, DATABASE_ENV } from "../../playwright.config";

/** Unique per run: the database is fresh, but specs must not depend on each other's rows. */
export const uniq = () => Date.now().toString(36).slice(-5);

export async function signUp(page: Page, slug: string) {
  await page.goto("/signup");
  await page.getByLabel("Nama usaha").fill(`Kopi ${slug}`);
  await page.getByLabel("Nama Anda").fill("Budi");
  await page.getByLabel("Email").fill(`budi-${slug}@kopi.id`);
  await page.getByLabel("Password").fill("rahasia-123");
  await page.getByLabel("Kode outlet").fill("JKT01");
  await page.getByLabel("Nama outlet").fill("Kemang");
  await page.getByRole("button", { name: "Buat akun" }).click();
  await expect(page.getByRole("button", { name: "CSV" })).toBeVisible();
  return { email: `budi-${slug}@kopi.id`, password: "rahasia-123" };
}

/** Runs the daily billing job once against the e2e database (same code path as the worker). */
export function runBilling() {
  execFileSync("uv", ["run", "python", "-m", "poslite.billing", "run"], {
    cwd: path.join(__dirname, "../../../poslite-api"),
    env: { ...process.env, ...DATABASE_ENV, PUBLIC_API_URL: API_ORIGIN },
    stdio: "inherit",
  });
}

/** Moves billing dates into the past for one tenant (time travel for the subscription flow). */
export function sql(statement: string) {
  execFileSync("psql", ["-h", "localhost", "-d", "poslite_e2e_admin", "-v", "ON_ERROR_STOP=1", "-q", "-c", statement], { stdio: "inherit" });
}
