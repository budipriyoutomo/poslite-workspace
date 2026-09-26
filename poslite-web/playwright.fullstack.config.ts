import { defineConfig, devices } from "@playwright/test";

// Full stack: the real API (fresh poslite_e2e database, created by `make e2e-fullstack`) and a
// production build of the web app pointed at it. Ports differ from dev (8000/3000) and web e2e (3200).
const DB = "localhost:5432/poslite_e2e";
export const API_URL = "http://localhost:8200/api/v1";
const WEB_URL = "http://localhost:3300";

export default defineConfig({
  testDir: "./tests/fullstack",
  workers: 1,
  reporter: "list",
  timeout: 120_000,
  use: { baseURL: WEB_URL, ...devices["Galaxy Tab S9 landscape"], channel: process.env.PW_CHANNEL || undefined },
  webServer: [
    {
      command: "uv run alembic upgrade head && uv run uvicorn poslite.main:app --port 8200",
      cwd: "../poslite-api",
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: `postgresql+asyncpg://poslite_app:poslite@${DB}`,
        MIGRATION_DATABASE_URL: `postgresql+asyncpg://poslite:poslite@${DB}`,
        SYSTEM_DATABASE_URL: `postgresql+asyncpg://poslite_system:poslite@${DB}`,
        CORS_ORIGINS: JSON.stringify([WEB_URL]),
      },
    },
    {
      command: "pnpm build && ./node_modules/.bin/next start -p 3300",
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 240_000,
      env: { NEXT_PUBLIC_API_URL: API_URL },
    },
  ],
});
