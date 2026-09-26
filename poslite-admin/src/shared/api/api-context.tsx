"use client";

import { createContext, type ReactNode, useContext } from "react";

import type { Api } from "./client";

const ApiContext = createContext<Api | null>(null);

export function ApiProvider({ api, children }: { api: Api; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

/** The typed API client; the app wires the token and the 401 handling (src/app/providers.tsx). */
export function useApi(): Api {
  const api = useContext(ApiContext);
  if (!api) throw new Error("useApi() outside <ApiProvider>");
  return api;
}
