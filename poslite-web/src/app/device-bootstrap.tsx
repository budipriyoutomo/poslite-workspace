"use client";

import { useEffect } from "react";

import { startOpenBillLoop } from "@/features/bills";
import { startSyncLoop } from "@/features/sync";

/** App-wide device setup: persistent storage, the background sync loop and the shared-bill loop (ADR-031). */
export function DeviceBootstrap() {
  useEffect(() => {
    // Ask the browser not to evict IndexedDB under storage pressure (02-frontend-architecture.md).
    void navigator.storage?.persist?.();
    const stopSync = startSyncLoop();
    const stopBills = startOpenBillLoop();
    return () => {
      stopSync();
      stopBills();
    };
  }, []);
  return null;
}
