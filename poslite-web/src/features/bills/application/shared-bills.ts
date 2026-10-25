"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { API_BASE_URL, APP_VERSION } from "@/config/env";
import { useSession } from "@/features/auth";
import { useCart } from "@/features/cart";
import { deviceApi, serverDevice } from "@/features/sync";
import { getDb, readState, type ServiceMode } from "@/shared/db";
import { AppError } from "@/shared/errors";

import { httpOpenBillApi } from "../infrastructure/open-bill-http";
import { type OpenBillSyncDeps, syncOpenBills } from "./open-bill-sync";
import { type BillStore, billStoreFor, resolveServiceMode } from "./service-mode";

// ADR-031 rule 3: the outlet's bills are polled every 5 s while online (SSE may follow the pilot).
const EVERY_MS = 5_000;

/** Everything the shared-bill use cases need on this device right now. */
export async function sharedBillDeps(): Promise<OpenBillSyncDeps> {
  const db = getDb();
  const device = await serverDevice(db);
  const userId = useSession.getState().user?.id;
  if (!userId) throw new AppError("NO_USER");
  return {
    db,
    api: httpOpenBillApi(deviceApi({ baseUrl: API_BASE_URL, appVersion: APP_VERSION }, device)),
    deviceId: device.deviceId,
    userId,
    now: () => new Date(),
    activeBillId: () => useCart.getState().bill?.id ?? null,
  };
}

let isRunning = false;

/** One round: follow the outlet's mode, then exchange bills with the server in table-service mode. */
async function tick(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    const { mode } = await resolveServiceMode(getDb());
    if (mode !== "table_service" || !navigator.onLine || !useSession.getState().user) return;
    await syncOpenBills(await sharedBillDeps());
  } catch {
    // shown by the sync badge on the next full sync; the next round tries again
  } finally {
    isRunning = false;
  }
}

/** Starts the bill loop (every 5 s, and when back online). Returns a stop function. */
export function startOpenBillLoop(): () => void {
  const interval = setInterval(() => void tick(), EVERY_MS);
  const soon = () => void tick();
  window.addEventListener("online", soon);
  soon();
  return () => {
    clearInterval(interval);
    window.removeEventListener("online", soon);
  };
}

/** Ask for a bill round now (after a save), instead of waiting up to 5 s. */
export const kickBillSync = (): void => void tick();

/** The mode this device works in, and the outlet's new mode while it still has bills of its own. */
export function useServiceMode(): { mode: ServiceMode; pending: ServiceMode | null } | undefined {
  return useLiveQuery(async () => {
    const db = getDb();
    const mode = (await readState(db, "serviceMode")) ?? "counter";
    const wanted = (await db.settings.get("outlet"))?.value.serviceMode ?? "counter";
    return { mode, pending: wanted === mode ? null : wanted };
  }, []);
}

/** The bill store of this device's mode (ADR-031): the screens never ask which one it is. */
export function useBillStore(): BillStore {
  return billStoreFor(useServiceMode()?.mode ?? "counter", sharedBillDeps);
}
