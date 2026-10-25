"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { checkManagerPin, useManagers } from "@/features/auth";
import { API_BASE_URL, APP_VERSION } from "@/config/env";
import { getDb, readState } from "@/shared/db";

import { orderLookup } from "../infrastructure/order-lookup";

/** Managers and owners on this device: they approve voids and refunds with their PIN. */
export function useApprovers() {
  return useManagers() ?? [];
}

/** Offline PIN check of a manager (same PBKDF2 and lockout as the lock screen). */
export const verifyApprover = checkManagerPin;

export function useRefundsOf(orderIds: string[]) {
  return useLiveQuery(() => getDb().refunds.where("orderId").anyOf(orderIds).toArray(), [orderIds.join()]) ?? [];
}

export function usePaymentMethods() {
  return useLiveQuery(() => getDb().paymentMethods.orderBy("sortOrder").toArray(), []) ?? [];
}

/** Online lookup of an order of this outlet from any device; null in demo mode. */
export async function lookupOrder(receiptNo: string) {
  const device = await readState(getDb(), "device");
  if (device?.mode !== "server") return null;
  return orderLookup({ baseUrl: API_BASE_URL, appVersion: APP_VERSION, token: device.token, deviceId: device.deviceId })(receiptNo);
}
