"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { type Api, ApiError, type components, unwrap, useApi } from "@/shared/api";

export type Category = components["schemas"]["CategoryOut"];
export type Product = components["schemas"]["ProductOut"];
export type ProductIn = components["schemas"]["ProductIn"];
export type ModifierGroup = components["schemas"]["ModifierGroupOut"];
export type ModifierGroupIn = components["schemas"]["ModifierGroupIn"];
export type CategoryIn = components["schemas"]["CategoryIn"];
export type UploadedImage = components["schemas"]["ImageOut"];

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

/** Product image sent as the raw request body (ADR-021); the API answers its storage key and URL. */
export function useUploadImage() {
  const api = useApi();
  return useMutation({
    mutationFn: async (file: File) =>
      unwrap(
        api.POST("/api/v1/media/images", {
          // The bytes, not the File: a Blob body is not portable across fetch implementations.
          body: (await file.arrayBuffer()) as unknown as string,
          bodySerializer: (body) => body as unknown as BodyInit,
          headers: { "Content-Type": file.type },
        }),
      ),
  });
}

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Menu import (P1-4): `dryRun` previews every row; otherwise all rows go in, or none. */
export function useMenuImport() {
  const api = useApi();
  return useMenuMutation(
    async ({ file, dryRun }: { file: File; dryRun: boolean }) =>
      unwrap(
        api.POST("/api/v1/menu-import", {
          params: { query: { dry_run: dryRun } },
          body: (await file.arrayBuffer()) as unknown as string,
          bodySerializer: (body) => body as unknown as BodyInit,
          headers: { "Content-Type": XLSX },
        }),
      ),
    ["products", "categories", "modifier-groups"],
  );
}

/** The workbook to fill in, saved under the server's filename. */
export async function downloadMenuTemplate(api: Api): Promise<void> {
  const { data, response } = await api.GET("/api/v1/menu-import/template", { parseAs: "blob" });
  if (!response.ok || !(data instanceof Blob)) throw new ApiError(response.status, `HTTP_${response.status}`, "Unduh gagal");
  const url = URL.createObjectURL(data);
  Object.assign(document.createElement("a"), { href: url, download: "template-menu.xlsx" }).click();
  URL.revokeObjectURL(url);
}
