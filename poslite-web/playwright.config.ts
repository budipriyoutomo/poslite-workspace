import { defineConfig, devices } from "@playwright/test";

// PW_CHANNEL=chrome runs against the locally installed Google Chrome (needed where Playwright
// ships no bundled Chromium, e.g. macOS 13). CI uses the bundled Chromium.
const channel = process.env.PW_CHANNEL || undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Own port: never reuse a `make dev` server on :3000 (dev mode has no service worker).
  use: { baseURL: "http://localhost:3200", trace: "on-first-retry" },
  // Primary targets: Chrome on Android tablets and Chrome/Edge on Windows (README assumptions).
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], channel } },
    { name: "tablet", use: { ...devices["Galaxy Tab S9 landscape"], channel } },
    // Responsive layouts (poslite-docs/12-responsive-ui.md): bottom navigation and sheets on a phone,
    // rail with the cart beside the grid on a portrait tablet. Chromium so PW_CHANNEL applies.
    { name: "phone", use: { ...devices["Pixel 7"], channel } },
    { name: "tablet-portrait", use: { ...devices["iPad Pro 11"], defaultBrowserType: "chromium", channel } },
  ],
  webServer: {
    // Start next directly: via `pnpm start` the server outlives Playwright's teardown.
    command: "pnpm build && ./node_modules/.bin/next start -p 3200",
    // The offline specs start from "Coba mode demo", which a tenant build hides (15 · UX-01).
    env: { NEXT_PUBLIC_DEMO_ENABLED: "true" },
    url: "http://localhost:3200",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
