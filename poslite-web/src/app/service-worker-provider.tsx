"use client";

import { SerwistProvider } from "@serwist/next/react";
import { type ReactNode, useEffect } from "react";

// public/sw.js only exists after `pnpm build`; the dev server runs without a service worker.
const isDev = process.env.NODE_ENV === "development";

export function ServiceWorkerProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // A worker left over from a production run on the same origin would serve stale precached pages.
    if (isDev && "serviceWorker" in navigator) {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((r) => r.unregister())));
    }
  }, []);

  return (
    // reloadOnOnline would reload the page mid-sale when the connection returns.
    <SerwistProvider swUrl="/sw.js" disable={isDev} reloadOnOnline={false}>
      {children}
    </SerwistProvider>
  );
}
