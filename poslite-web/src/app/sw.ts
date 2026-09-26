/// <reference lib="webworker" />
// Service worker source, bundled by `serwist build` after `next build` (configurator mode, ADR-002).
import { defaultCache } from "@serwist/next/worker";
import { NetworkOnly, type PrecacheEntry, Serwist, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // A new version waits until the app tells it to activate (only when the cart is empty,
  // 02-frontend-architecture.md "Update flow"), so a sale in progress is never disrupted.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  // API responses never come from a cache: sync data lives in IndexedDB (02 "PWA & Service Worker").
  runtimeCaching: [{ matcher: ({ url }) => url.pathname.startsWith("/api/v1/"), handler: new NetworkOnly() }, ...defaultCache],
});

serwist.addEventListeners();
