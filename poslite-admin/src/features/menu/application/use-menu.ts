"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { type components, unwrap, useApi } from "@/shared/api";

export type Category = components["schemas"]["CategoryOut"];
export type Product = components["schemas"]["ProductOut"];
export type ProductIn = components["schemas"]["ProductIn"];
export type ModifierGroup = components["schemas"]["ModifierGroupOut"];
export type ModifierGroupIn = components["schemas"]["ModifierGroupIn"];
export type CategoryIn = components["schemas"]["CategoryIn"];

export function useCategories() {
  const api = useApi();
  return useQuery({ queryKey: ["categories"], queryFn: () => unwrap(api.GET("/api/v1/categories")) });
}

export function useProducts() {
  const api = useApi();
  return useQuery({ queryKey: ["products"], queryFn: () => unwrap(api.GET("/api/v1/products")) });
}

export function useModifierGroups() {
  const api = useApi();
  return useQuery({ queryKey: ["modifier-groups"], queryFn: () => unwrap(api.GET("/api/v1/modifier-groups")) });
}

/** Mutation that refreshes the given lists afterwards (menu changes also reach devices via pull). */
function useMenuMutation<T>(fn: (input: T) => Promise<unknown>, keys: string[]) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all(keys.map((key) => client.invalidateQueries({ queryKey: [key] }))),
  });
}

export function useSaveProduct() {
  const api = useApi();
  return useMenuMutation(
    ({ id, body }: { id?: string; body: ProductIn }) =>
      id ? unwrap(api.PUT("/api/v1/products/{product_id}", { params: { path: { product_id: id } }, body })) : unwrap(api.POST("/api/v1/products", { body })),
    ["products", "outlet-products"],
  );
}

export function useDeleteProduct() {
  const api = useApi();
  return useMenuMutation((id: string) => unwrap(api.DELETE("/api/v1/products/{product_id}", { params: { path: { product_id: id } } })), ["products", "outlet-products"]);
}

export function useSaveCategory() {
  const api = useApi();
  return useMenuMutation(
    ({ id, body }: { id?: string; body: CategoryIn }) =>
      id ? unwrap(api.PUT("/api/v1/categories/{category_id}", { params: { path: { category_id: id } }, body })) : unwrap(api.POST("/api/v1/categories", { body })),
    ["categories"],
  );
}

export function useDeleteCategory() {
  const api = useApi();
  return useMenuMutation((id: string) => unwrap(api.DELETE("/api/v1/categories/{category_id}", { params: { path: { category_id: id } } })), ["categories"]);
}

export function useSaveModifierGroup() {
  const api = useApi();
  return useMenuMutation(
    ({ id, body }: { id?: string; body: ModifierGroupIn }) =>
      id ? unwrap(api.PUT("/api/v1/modifier-groups/{group_id}", { params: { path: { group_id: id } }, body })) : unwrap(api.POST("/api/v1/modifier-groups", { body })),
    ["modifier-groups"],
  );
}

export function useDeleteModifierGroup() {
  const api = useApi();
  return useMenuMutation((id: string) => unwrap(api.DELETE("/api/v1/modifier-groups/{group_id}", { params: { path: { group_id: id } } })), ["modifier-groups"]);
}
