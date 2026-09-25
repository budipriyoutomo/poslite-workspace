import { defineConfig, devices } from "@playwright/test";

// Spike benchmarks: real Chrome, no app server, run serially so timings don't compete for CPU.
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  workers: 1,
  reporter: "list",
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL || undefined } }],
});
