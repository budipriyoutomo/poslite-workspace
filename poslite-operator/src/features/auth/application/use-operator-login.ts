"use client";

import { useMutation } from "@tanstack/react-query";

import { unwrap, useApi } from "@/shared/api";

import { useOperatorStore } from "./session-store";

export function useOperatorLogin() {
  const api = useApi();
  const signIn = useOperatorStore((s) => s.signIn);
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => unwrap(api.POST("/api/v1/platform/auth/login", { body })),
    onSuccess: (r) => signIn({ token: r.token, expiresAt: r.expires_at }),
  });
}
