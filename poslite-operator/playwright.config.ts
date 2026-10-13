import { defineConfig, devices } from "@playwright/test";

// Operator console against the real API: a fresh poslite_e2e_operator database (created by
// `make operator-e2e`), the API on :8220 and a production build of the console on :3320 (dev uses 8000/3002).
const DB = "localhost:5432/poslite_e2e_operator";
// 127.0.0.1, not localhost: uvicorn binds IPv4 only and Node may resolve localhost to ::1 first.
export const API_ORIGIN = "http://127.0.0.1:8220";
const OPERATOR_URL = "http://localhost:3320";
export const DATABASE_ENV = {
  DATABASE_URL: `postgresql+asyncpg://poslite_app:poslite@${DB}`,
  MIGRATION_DATABASE_URL: `postgresql+asyncpg://poslite:poslite@${DB}`,
  SYSTEM_DATABASE_URL: `postgresql+asyncpg://poslite_system:poslite@${DB}`,
};

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  use: { baseURL: OPERATOR_URL, ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL || undefined },
  webServer: [
    {
      command: "uv run alembic upgrade head && uv run uvicorn poslite.main:app --port 8220",
      cwd: "../poslite-api",
      url: `${API_ORIGIN}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...DATABASE_ENV, CORS_ORIGINS: JSON.stringify([OPERATOR_URL]), PUBLIC_API_URL: API_ORIGIN, MEDIA_STORAGE: "local" },
    },
    {
      command: "pnpm build && ./node_modules/.bin/next start -p 3320",
      url: OPERATOR_URL,
      reuseExistingServer: false,
      timeout: 600_000, // next build on a busy 4-core laptop can take minutes
      env: { NEXT_PUBLIC_API_ORIGIN: API_ORIGIN },
    },
  ],
});
