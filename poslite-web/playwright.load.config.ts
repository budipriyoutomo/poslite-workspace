import { defineConfig } from "@playwright/test";

import fullstack from "./playwright.fullstack.config";

// P1-10 device load (poslite-docs/14-pilot-readiness.md): the full stack, one worker so timings do
// not compete, CPU throttled in the spec to approximate a mid-range Android tablet.
export default defineConfig({ ...fullstack, testDir: "./tests/load", timeout: 600_000 });
