"use client";

import { useQuery } from "@tanstack/react-query";

import { unwrap, useApi } from "@/shared/api";

import { activeBrand, pageAccess } from "../domain/access";
import { useSessionStore } from "./session-store";

export const ACCESS_KEY = ["me", "access"] as const;

/** GET /me/access (ADR-022): the brands and outlets this user may pick. */
export function useAccess(enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: ACCESS_KEY, queryFn: () => unwrap(api.GET("/api/v1/me/access")), enabled });
}

/** The active brand of the session, as an entry of the access tree. */
export function useActiveBrand() {
  const access = useAccess();
  const brandId = useSessionStore((s) => s.session?.brandId ?? null);
  return access.data ? activeBrand(access.data, brandId) : null;
}

/** Which pages the user may open: company pages and brand management (menu, promotions). */
export function usePageAccess() {
  const access = useAccess();
  const brandId = useSessionStore((s) => s.session?.brandId ?? null);
  return pageAccess(access.data, brandId);
}
