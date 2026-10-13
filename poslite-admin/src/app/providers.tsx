"use client";

import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";

import { API_ORIGIN } from "@/config/env";
import { useSessionStore } from "@/features/auth";
import { ApiError, ApiProvider, createApi } from "@/shared/api";
import { Toaster } from "@/shared/ui/sonner";

/** A 401 means the token expired or was revoked: sign out (AuthGate then shows /login). */
function signOutOnUnauthorized(error: unknown) {
  if (error instanceof ApiError && error.status === 401) useSessionStore.getState().signOut();
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: signOutOnUnauthorized }),
        defaultOptions: { queries: { staleTime: 30_000, retry: 1 }, mutations: { onError: signOutOnUnauthorized } },
      }),
  );
  // Another user (or none) must never see the previous user's cached data, e.g. their brands.
  useEffect(
    () =>
      useSessionStore.subscribe((state, previous) => {
        if (state.session?.token !== previous.session?.token) queryClient.clear();
      }),
    [queryClient],
  );
  const [api] = useState(() =>
    createApi({
      origin: API_ORIGIN,
      getToken: () => useSessionStore.getState().session?.token ?? null,
      getBrandId: () => useSessionStore.getState().session?.brandId ?? null,
    }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={api}>
        {children}
        <Toaster position="top-center" richColors />
      </ApiProvider>
    </QueryClientProvider>
  );
}
