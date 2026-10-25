"use client";

import { useMutation } from "@tanstack/react-query";

import { unwrap, useApi } from "@/shared/api";

/** Step 1 (P1-8): the password opens only the second step, never the console. */
export function useOperatorLogin() {
  const api = useApi();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => unwrap(api.POST("/api/v1/platform/auth/login", { body })),
  });
}

/** Step 2: a TOTP code, or a one-time recovery code, opens the console. */
export function useSecondFactor() {
  const api = useApi();
  return useMutation({
    mutationFn: (body: { challenge_token: string; code?: string | null; recovery_code?: string | null }) => unwrap(api.POST("/api/v1/platform/auth/2fa", { body })),
  });
}
