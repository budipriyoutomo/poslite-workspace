"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useSyncExternalStore } from "react";

import { isSignedIn, useSessionStore } from "../application/session-store";
import { useAccess } from "../application/use-access";
import { activeBrand } from "../domain/access";

function useHydrated(): boolean {
  return useSyncExternalStore(
    (cb) => useSessionStore.persist.onFinishHydration(cb),
    () => useSessionStore.persist.hasHydrated(),
    () => false,
  );
}

/** Pages behind the back-office login; an expired or missing session goes to /login.
 * Pages show once a brand is active (ADR-022): after sign-in, the first brand the user may see. */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const isHydrated = useHydrated();
  const session = useSessionStore((s) => s.session);
  const selectBrand = useSessionStore((s) => s.selectBrand);
  const signedIn = isSignedIn(session, new Date());
  const brandId = session?.brandId ?? null;
  const access = useAccess(isHydrated && signedIn);
  // A brand the user can no longer see (assignment changed) falls back to their first brand.
  const wanted = access.data ? (activeBrand(access.data, brandId)?.id ?? null) : brandId;

  useEffect(() => {
    if (isHydrated && !signedIn) router.replace("/login");
  }, [isHydrated, signedIn, router]);

  useEffect(() => {
    if (wanted !== null && wanted !== brandId) selectBrand(wanted);
  }, [brandId, wanted, selectBrand]);

  return isHydrated && signedIn && brandId !== null ? children : null;
}
