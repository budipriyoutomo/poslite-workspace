"use client";

import { useQuery } from "@tanstack/react-query";

import { type components, unwrap, useApi } from "@/shared/api";

export type UserHit = components["schemas"]["UserHitOut"];

export const MIN_QUERY = 2;

/** Users of every tenant by name or email; idle until the query has MIN_QUERY characters. */
export function useUserSearch(q: string) {
  const api = useApi();
  return useQuery({
    queryKey: ["users", q],
    queryFn: () => unwrap(api.GET("/api/v1/platform/users", { params: { query: { q } } })),
    enabled: q.length >= MIN_QUERY,
  });
}
