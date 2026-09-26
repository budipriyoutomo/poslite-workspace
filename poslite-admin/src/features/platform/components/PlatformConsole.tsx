"use client";

import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LogOut, ShieldCheck } from "lucide-react";
import { type ReactNode, useState, useSyncExternalStore } from "react";

import { ApiError, ApiProvider, createApi } from "@/shared/api";
import { Button } from "@/shared/ui/button";

import { isOperatorSignedIn, useOperatorStore } from "../application/operator-session";
import { OperatorLogin } from "./OperatorLogin";

function signOutOnUnauthorized(error: unknown) {
  if (error instanceof ApiError && error.status === 401) useOperatorStore.getState().signOut();
}

function useHydrated(): boolean {
  return useSyncExternalStore(
    (cb) => useOperatorStore.persist.onFinishHydration(cb),
    () => useOperatorStore.persist.hasHydrated(),
    () => false,
  );
}

/**
 * The /platform area: its own API client (operator token, never the tenant one) and query cache,
 * so an operator and an owner session in the same browser never mix.
 */
export function PlatformConsole({ origin, children }: { origin: string; children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: signOutOnUnauthorized }),
        defaultOptions: { queries: { retry: 1 }, mutations: { onError: signOutOnUnauthorized } },
      }),
  );
  const [api] = useState(() => createApi({ origin, getToken: () => useOperatorStore.getState().session?.token ?? null }));
  const isHydrated = useHydrated();
  const session = useOperatorStore((s) => s.session);
  const signOut = useOperatorStore((s) => s.signOut);

  if (!isHydrated) return null;
  return (
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={api}>
        {isOperatorSignedIn(session, new Date()) ? (
          <div className="min-h-dvh bg-slate-100">
            <header className="flex items-center justify-between bg-slate-900 px-6 py-3 text-white">
              <span className="flex items-center gap-2 font-semibold">
                <ShieldCheck className="size-5" /> POSLite · Konsol Platform
              </span>
              <Button variant="ghost" size="sm" className="text-white hover:bg-slate-800 hover:text-white" onClick={() => (signOut(), queryClient.clear())}>
                <LogOut /> Keluar
              </Button>
            </header>
            <main className="mx-auto max-w-6xl p-6">{children}</main>
          </div>
        ) : (
          <OperatorLogin />
        )}
      </ApiProvider>
    </QueryClientProvider>
  );
}
