// @ts-check
// Serwist configurator mode: `serwist build` runs after `next build` so every prerendered POS route
// is precached (ADR-002 — `output: "export"` is not supported by @serwist/next).
import { serwist } from "@serwist/next/config";

export default serwist({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
});
