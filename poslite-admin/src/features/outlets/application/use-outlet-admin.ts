"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { type components, unwrap, useApi } from "@/shared/api";

export type OutletSettings = components["schemas"]["OutletSettingsOut"];
export type OutletSettingsIn = components["schemas"]["OutletSettingsIn"];
export type NewOutlet = components["schemas"]["NewOutletIn"];
export type Device = components["schemas"]["DeviceListItem"];

export const TIMEZONES = [
  { value: "Asia/Jakarta", label: "WIB (Jakarta)" },
  { value: "Asia/Makassar", label: "WITA (Makassar)" },
  { value: "Asia/Jayapura", label: "WIT (Jayapura)" },
];

export function useOutletSettings(outletId: string) {
  const api = useApi();
  return useQuery({
    queryKey: ["outlet-settings", outletId],
    queryFn: () => unwrap(api.GET("/api/v1/outlets/{outlet_id}", { params: { path: { outlet_id: outletId } } })),
  });
}

/** New rates apply to new orders once devices pull them; past orders keep their snapshot (ADR-011). */
export function useSaveOutletSettings(outletId: string) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: OutletSettingsIn) => unwrap(api.PUT("/api/v1/outlets/{outlet_id}", { params: { path: { outlet_id: outletId } }, body })),
    onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: ["outlet-settings", outletId] }), client.invalidateQueries({ queryKey: ["outlets"] })]),
  });
}

export function useCreateOutlet() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: NewOutlet) => unwrap(api.POST("/api/v1/outlets", { body })),
    onSuccess: () => client.invalidateQueries({ queryKey: ["outlets"] }),
  });
}

export function useDevices(outletId: string) {
  const api = useApi();
  return useQuery({
    queryKey: ["devices", outletId],
    queryFn: () => unwrap(api.GET("/api/v1/outlets/{outlet_id}/devices", { params: { path: { outlet_id: outletId } } })),
  });
}

/** A lost or stolen tablet: its token stops working immediately. */
export function useRevokeDevice(outletId: string) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (deviceId: string) => unwrap(api.DELETE("/api/v1/devices/{device_id}", { params: { path: { device_id: deviceId } } })),
    onSuccess: () => client.invalidateQueries({ queryKey: ["devices", outletId] }),
  });
}
