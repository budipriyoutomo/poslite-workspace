import { z } from "zod";

import { type ApiConfig, apiRequest } from "@/shared/api";
import { type PosDb, readState } from "@/shared/db";

import type { QrisCharge, QrisClient } from "../domain/qris";

const chargeSchema = z
  .object({
    id: z.string(),
    amount: z.number().int().positive(),
    status: z.enum(["pending", "paid", "expired"]),
    qr_string: z.string(),
    expires_at: z.string(),
  })
  .transform((c): QrisCharge => ({ id: c.id, amount: c.amount, status: c.status, qrString: c.qr_string, expiresAt: c.expires_at }));

/** Dynamic QRIS over the API with this device's token; null in demo mode (no server, ADR-019). */
export async function qrisClientFor(db: PosDb, api: Omit<ApiConfig, "token" | "deviceId">): Promise<QrisClient | null> {
  const device = await readState(db, "device");
  if (device?.mode !== "server") return null;
  const config: ApiConfig = { ...api, token: device.token, deviceId: device.deviceId };
  return {
    create: (id, amount) => apiRequest(config, "POST", "/payments/qris", chargeSchema, { id, amount }),
    status: (id) => apiRequest(config, "GET", `/payments/qris/${id}`, chargeSchema),
  };
}
