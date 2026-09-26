"use client";

import { create } from "zustand";

import { API_BASE_URL, APP_VERSION } from "@/config/env";
import { getDb } from "@/shared/db";

import { runSync } from "./sync-engine";

const KICK_EVENT = "poslite:sync";
const EVERY_MS = 15_000;
const KICK_DEBOUNCE_MS = 300;

interface SyncRuntime {
  isSyncing: boolean;
  lastError: string | null;
}

export const useSyncRuntime = create<SyncRuntime>(() => ({ isSyncing: false, lastError: null }));

/** Ask for a sync soon (after a sale, a shift change, …). Safe to call anywhere, even in tests. */
export function kickSync(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(KICK_EVENT));
}

async function syncOnce(): Promise<void> {
  if (!navigator.onLine) return;
  const work = async () => {
    useSyncRuntime.setState({ isSyncing: true });
    try {
      await runSync({ db: getDb(), api: { baseUrl: API_BASE_URL, appVersion: APP_VERSION }, now: () => new Date() });
      useSyncRuntime.setState({ lastError: null });
    } catch (e) {
      useSyncRuntime.setState({ lastError: e instanceof Error ? e.message : String(e) });
    } finally {
      useSyncRuntime.setState({ isSyncing: false });
    }
  };
  // Web Locks: one tab syncs at a time; the others skip this round.
  if (navigator.locks) await navigator.locks.request("poslite-sync", { ifAvailable: true }, (lock) => (lock ? work() : undefined));
  else await work();
}

/** Starts the sync loop: on start, when back online, every 15 s and when kicked. Returns a stop function. */
export function startSyncLoop(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const soon = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void syncOnce(), KICK_DEBOUNCE_MS);
  };
  const interval = setInterval(() => void syncOnce(), EVERY_MS);
  window.addEventListener("online", soon);
  window.addEventListener(KICK_EVENT, soon);
  soon();
  return () => {
    clearTimeout(timer);
    clearInterval(interval);
    window.removeEventListener("online", soon);
    window.removeEventListener(KICK_EVENT, soon);
  };
}
