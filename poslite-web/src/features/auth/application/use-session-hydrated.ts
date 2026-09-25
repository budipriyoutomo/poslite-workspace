"use client";

import { useSyncExternalStore } from "react";

import { useSession } from "./session-store";

/** True once the session was read back from IndexedDB — redirect decisions must wait for it. */
export function useSessionHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useSession.persist.onFinishHydration(onChange),
    () => useSession.persist.hasHydrated(),
    () => false,
  );
}
