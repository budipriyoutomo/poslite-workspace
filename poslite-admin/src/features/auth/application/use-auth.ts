"use client";

import { useMutation } from "@tanstack/react-query";

import { ApiError, type components, unwrap, useApi } from "@/shared/api";

import { copy } from "../copy";
import { useSessionStore } from "./session-store";

export type SignupRequest = components["schemas"]["SignupRequest"];

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return copy.errors[error.code] ?? error.message;
  return copy.errors.network!;
}

export function useLogin() {
  const api = useApi();
  const signIn = useSessionStore((s) => s.signIn);
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => unwrap(api.POST("/api/v1/auth/login", { body })),
    onSuccess: signIn,
  });
}

export function useSignup() {
  const api = useApi();
  const signIn = useSessionStore((s) => s.signIn);
  return useMutation({
    mutationFn: (body: SignupRequest) => unwrap(api.POST("/api/v1/tenants/signup", { body })),
    onSuccess: signIn,
  });
}
