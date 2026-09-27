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

/**
 * The operator CLI prompts for the password on a TTY, so the test calls the same
 * `create_admin` use-case directly.
 */
export function createOperator(email: string, password: string) {
  const script = [
    "import asyncio, sys",
    "from poslite.platform_admin.api import create_admin",
    "from poslite.shared.config import get_settings",
    "from poslite.shared.infrastructure.database import create_engine, session_factory",
    "async def main():",
    "    engine = create_engine(get_settings().system_database_url)",
    "    try: await create_admin(session_factory(engine), email=sys.argv[1], name='E2E Ops', password=sys.argv[2])",
    "    finally: await engine.dispose()",
    "asyncio.run(main())",
  ].join("\n");
  execFileSync("uv", ["run", "python", "-c", script, email, password], {
    cwd: path.join(__dirname, "../../../poslite-api"),
    env: { ...process.env, ...DATABASE_ENV },
    stdio: "inherit",
  });
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
