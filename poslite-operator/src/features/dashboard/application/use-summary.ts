"use client";

import { useQuery } from "@tanstack/react-query";

import { unwrap, useApi } from "@/shared/api";

export function useSummary() {
  const api = useApi();
  return useQuery({ queryKey: ["summary"], queryFn: () => unwrap(api.GET("/api/v1/platform/summary")) });
}
