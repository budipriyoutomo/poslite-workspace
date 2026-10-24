"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { type components, unwrap, useApi } from "@/shared/api";

export type User = components["schemas"]["poslite__identity__application__schemas__UserOut"];
export type UserIn = components["schemas"]["UserIn"];
export type UserUpdate = components["schemas"]["UserUpdate"];
export type AssignmentIn = components["schemas"]["AssignmentIn"];
export type Role = AssignmentIn["role"];

export const ROLES: { value: Role; label: string }[] = [
  { value: "waiter", label: "Pelayan" },
  { value: "cashier", label: "Kasir" },
  { value: "manager", label: "Manajer" },
  { value: "owner", label: "Pemilik" },
];

/** 4–6 digits, same rule as the API and the POS lock screen. */
export const isValidPin = (pin: string) => /^\d{4,6}$/.test(pin);

export function useUsers() {
  const api = useApi();
  return useQuery({ queryKey: ["users"], queryFn: () => unwrap(api.GET("/api/v1/users")) });
}

function useUsersMutation<T>(fn: (input: T) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => client.invalidateQueries({ queryKey: ["users"] }) });
}

export function useCreateUser() {
  const api = useApi();
  return useUsersMutation((body: UserIn) => unwrap(api.POST("/api/v1/users", { body })));
}

/** Name and status, then the full list of assignments (ADR-022). */
export function useUpdateUser() {
  const api = useApi();
  return useUsersMutation(async ({ id, body, assignments }: { id: string; body: UserUpdate; assignments: AssignmentIn[] }) => {
    const path = { params: { path: { user_id: id } } };
    await unwrap(api.PUT("/api/v1/users/{user_id}", { ...path, body }));
    return unwrap(api.PUT("/api/v1/users/{user_id}/assignments", { ...path, body: { assignments } }));
  });
}

export function useChangePin() {
  const api = useApi();
  return useUsersMutation(({ id, pin }: { id: string; pin: string }) => unwrap(api.PUT("/api/v1/users/{user_id}/pin", { params: { path: { user_id: id } }, body: { pin } })));
}

export function useDeleteUser() {
  const api = useApi();
  return useUsersMutation((id: string) => unwrap(api.DELETE("/api/v1/users/{user_id}", { params: { path: { user_id: id } } })));
}
