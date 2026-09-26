"use client";

import { useEffect } from "react";

import { startSyncLoop } from "@/features/sync";

/** App-wide device setup: persistent storage and the background sync loop. */
export function DeviceBootstrap() {
  useEffect(() => {
    // Ask the browser not to evict IndexedDB under storage pressure (02-frontend-architecture.md).
    void navigator.storage?.persist?.();
    return startSyncLoop();
  }, []);
  return null;
}
