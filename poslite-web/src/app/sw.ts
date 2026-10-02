/// <reference lib="webworker" />
// Service worker source, bundled by `serwist build` after `next build` (configurator mode, ADR-002).
import { defaultCache } from "@serwist/next/worker";
import { CacheableResponsePlugin, CacheFirst, ExpirationPlugin, NetworkOnly, type PrecacheEntry, Serwist, type SerwistGlobalConfig } from "serwist";

import { isStoredPhoto } from "@/shared/media";

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
  runtimeCaching: [
    { matcher: ({ url }) => url.pathname.startsWith("/api/v1/"), handler: new NetworkOnly() },
    // Product photos from S3 (ADR-021): immutable keys → cache-first, so the menu keeps its photos offline.
    // Status 0 = opaque response from an <img> without CORS; still displayable.
    {
      matcher: ({ url, request }) => isStoredPhoto(url, request.destination, self.location.origin),
      handler: new CacheFirst({
        cacheName: "product-photos",
        plugins: [new CacheableResponsePlugin({ statuses: [0, 200] }), new ExpirationPlugin({ maxEntries: 1000, maxAgeSeconds: 90 * 24 * 60 * 60 })],
      }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();
