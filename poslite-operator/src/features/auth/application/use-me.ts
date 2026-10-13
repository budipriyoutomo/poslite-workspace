"use client";

import { useQuery } from "@tanstack/react-query";

import { type components, unwrap, useApi } from "@/shared/api";

export type Operator = components["schemas"]["OperatorOut"];

/** The signed-in operator (name in the shell; nobody may disable themselves). */
export function useMe() {
  const api = useApi();
  return useQuery({ queryKey: ["me"], queryFn: () => unwrap(api.GET("/api/v1/platform/me")), staleTime: Infinity });
}
