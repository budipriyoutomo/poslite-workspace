// Run: make web-spike-dexie (see tests/spikes/playwright.config.ts). Prints a Markdown table.
import path from "node:path";

import { expect, test } from "@playwright/test";
import { build } from "esbuild";

import type { BenchOptions, BenchResult } from "./dexie-bench";

const OPTIONS: BenchOptions = { orders: 5_000, ordersPerDay: 200, pendingOrders: 200, runs: 20 };
// A blank page on a routed http origin gives the benchmark real IndexedDB without starting Next.
const ORIGIN = "http://localhost:4999/"; // localhost = secure context (navigator.storage)

async function bundle(): Promise<string> {
  const out = await build({
    entryPoints: [path.join(__dirname, "dexie-bench.ts")],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "DexieBench",
    target: "es2022",
  });
  return out.outputFiles[0]!.text;
}

function report(label: string, r: BenchResult): string {
  const mb = (b: number) => (b / 1_048_576).toFixed(1);
  const rows = Object.entries(r.timings).map(([name, t]) => `| ${name} | ${t.rows} | ${t.p50} | ${t.p95} |`);
  return [
    `### ${label}`,
    `Seed ${r.counts.orders} orders / ${r.counts.payments} payments / ${r.counts.outbox} outbox in one transaction: **${r.seedMs} ms**`,
    `Storage: estimate ${mb(r.storage.usageAfterBytes - r.storage.usageBeforeBytes)} MB (raw JSON ${mb(r.storage.jsonBytes)} MB)`,
    "",
    "| Query | Rows | p50 ms | p95 ms |",
    "|---|---|---|---|",
    ...rows,
  ].join("\n");
}

for (const cpu of [1, 4]) {
  test(`dexie with 5,000 orders — CPU ${cpu}x`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.route(ORIGIN, (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>bench</title>" }));
    await page.goto(ORIGIN);
    if (cpu > 1) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
    }
    await page.addScriptTag({ content: await bundle() });

    const result = await page.evaluate(
      (opts) => (window as unknown as { DexieBench: { run: (o: BenchOptions) => Promise<BenchResult> } }).DexieBench.run(opts),
      OPTIONS,
    );

    console.log(`\n${report(cpu === 1 ? "Desktop CPU (1x)" : `CPU throttled ${cpu}x (≈ mid-range Android tablet)`, result)}\n`);
    expect(result.counts.orders).toBe(OPTIONS.orders + OPTIONS.runs + 1);
  });
}
