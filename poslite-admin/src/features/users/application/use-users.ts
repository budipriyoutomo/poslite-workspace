"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { type components, unwrap, useApi } from "@/shared/api";

export type User = components["schemas"]["poslite__identity__application__schemas__UserOut"];
export type UserIn = components["schemas"]["UserIn"];
export type UserUpdate = components["schemas"]["UserUpdate"];
export type Role = components["schemas"]["OutletRole"]["role"];

export const ROLES: { value: Role; label: string }[] = [
  { value: "cashier", label: "Kasir" },
  { value: "manager", label: "Manajer" },
  { value: "owner", label: "Pemilik" },
];

export const roleLabel = (role: Role) => ROLES.find((r) => r.value === role)?.label ?? role;

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

export function useUpdateUser() {
  const api = useApi();
  return useUsersMutation(({ id, body }: { id: string; body: UserUpdate }) => unwrap(api.PUT("/api/v1/users/{user_id}", { params: { path: { user_id: id } }, body })));
}

export function useChangePin() {
  const api = useApi();
  return useUsersMutation(({ id, pin }: { id: string; pin: string }) => unwrap(api.PUT("/api/v1/users/{user_id}/pin", { params: { path: { user_id: id } }, body: { pin } })));
}

export function useDeleteUser() {
  const api = useApi();
  return useUsersMutation((id: string) => unwrap(api.DELETE("/api/v1/users/{user_id}", { params: { path: { user_id: id } } })));
}
