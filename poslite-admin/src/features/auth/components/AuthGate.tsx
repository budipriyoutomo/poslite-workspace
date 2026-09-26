"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useSyncExternalStore } from "react";

import { isSignedIn, useSessionStore } from "../application/session-store";

function useHydrated(): boolean {
  return useSyncExternalStore(
    (cb) => useSessionStore.persist.onFinishHydration(cb),
    () => useSessionStore.persist.hasHydrated(),
    () => false,
  );
}

/** Pages behind the back-office login; an expired or missing session goes to /login. */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const isHydrated = useHydrated();
  const session = useSessionStore((s) => s.session);
  const signedIn = isSignedIn(session, new Date());

  useEffect(() => {
    if (isHydrated && !signedIn) router.replace("/login");
  }, [isHydrated, signedIn, router]);

  return isHydrated && signedIn ? children : null;
}
