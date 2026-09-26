"use client";

import { useEffect, useState } from "react";

import { API_BASE_URL, APP_VERSION } from "@/config/env";
import { getDb } from "@/shared/db";
import { useOnlineStatus } from "@/shared/hooks";

import { qrisClientFor } from "../infrastructure/qris-client";
import type { QrisClient } from "./dynamic-qris";

/** Dynamic QRIS only when online on an activated device; otherwise null → static QRIS (ADR-019). */
export function useQrisClient(): QrisClient | null {
  const isOnline = useOnlineStatus();
  const [client, setClient] = useState<QrisClient | null>(null);
  useEffect(() => {
    let isCurrent = true;
    void qrisClientFor(getDb(), { baseUrl: API_BASE_URL, appVersion: APP_VERSION }).then((c) => isCurrent && setClient(c));
    return () => {
      isCurrent = false;
    };
  }, []);
  return isOnline ? client : null;
}
