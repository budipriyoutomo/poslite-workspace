"use client";

import { useEffect } from "react";

import { ensureDemoData, getDb } from "@/shared/db";

/** One-time device setup on app start: demo master data (until activation, Fase 2) + persistent storage. */
export function DeviceBootstrap() {
  useEffect(() => {
    void ensureDemoData(getDb());
    // Ask the browser not to evict IndexedDB under storage pressure (02-frontend-architecture.md).
    void navigator.storage?.persist?.();
  }, []);
  return null;
}
