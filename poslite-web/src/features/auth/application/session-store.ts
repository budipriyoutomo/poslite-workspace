import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

import { getDb } from "@/shared/db";

import { sessionStorageIn } from "../infrastructure/session-storage";
import type { SessionUser } from "./verify-pin";

/** Auto-lock after this much inactivity, including time the app was closed (02 "State Management"). */
export const IDLE_LOCK_MS = 15 * 60_000;

interface SessionState {
  user: SessionUser | null;
  lastActiveAt: number;
  login: (user: SessionUser) => void;
  lock: () => void;
  /** Record user activity (postpones the idle lock). */
  touch: () => void;
  lockIfIdle: () => void;
}

export function createSessionStore(storage: StateStorage, now: () => Date = () => new Date()) {
  return create<SessionState>()(
    persist(
      (set, get) => ({
        user: null,
        lastActiveAt: 0,
        login: (user) => set({ user, lastActiveAt: now().getTime() }),
        lock: () => set({ user: null }),
        touch: () => set({ lastActiveAt: now().getTime() }),
        lockIfIdle: () => {
          if (get().user && now().getTime() - get().lastActiveAt > IDLE_LOCK_MS) set({ user: null });
        },
      }),
      {
        name: "session",
        storage: createJSONStorage(() => storage),
        partialize: (s) => ({ user: s.user, lastActiveAt: s.lastActiveAt }),
      },
    ),
  );
}

/**
 * Logged-in cashier, kept in IndexedDB so an offline reload (e.g. a hard navigation served by the
 * service worker) does not throw the cashier out mid-sale. Idle devices lock themselves.
 */
export const useSession = createSessionStore(sessionStorageIn(getDb));
