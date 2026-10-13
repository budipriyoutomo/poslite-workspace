"use client";

import { type ReactNode, useSyncExternalStore } from "react";

import { isOperatorSignedIn, useOperatorStore } from "../application/session-store";
import { OperatorLogin } from "./OperatorLogin";

function useHydrated(): boolean {
  return useSyncExternalStore(
    (cb) => useOperatorStore.persist.onFinishHydration(cb),
    () => useOperatorStore.persist.hasHydrated(),
    () => false,
  );
}

/** The console for a signed-in operator; the login form otherwise. */
export function ConsoleGate({ children }: { children: ReactNode }) {
  const isHydrated = useHydrated();
  const session = useOperatorStore((s) => s.session);

  if (!isHydrated) return null;
  if (!isOperatorSignedIn(session, new Date())) return <OperatorLogin />;
  return children;
}
