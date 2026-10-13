"use client";

import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";

import { API_ORIGIN } from "@/config/env";
import { useOperatorStore } from "@/features/auth";
import { ApiError, ApiProvider, createApi } from "@/shared/api";
import { Toaster } from "@/shared/ui/sonner";

/** A 401 means the operator token expired or was revoked: sign out (ConsoleGate then shows the login). */
function signOutOnUnauthorized(error: unknown) {
  if (error instanceof ApiError && error.status === 401) useOperatorStore.getState().signOut();
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: signOutOnUnauthorized }),
        defaultOptions: { queries: { retry: 1 }, mutations: { onError: signOutOnUnauthorized } },
      }),
  );
  // Another operator (or none) must never see the previous operator's cached data.
  useEffect(
    () =>
      useOperatorStore.subscribe((state, previous) => {
        if (state.session?.token !== previous.session?.token) queryClient.clear();
      }),
    [queryClient],
  );
  const [api] = useState(() => createApi({ origin: API_ORIGIN, getToken: () => useOperatorStore.getState().session?.token ?? null }));
  return (
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={api}>
        {children}
        <Toaster position="top-center" richColors />
      </ApiProvider>
    </QueryClientProvider>
  );
}
