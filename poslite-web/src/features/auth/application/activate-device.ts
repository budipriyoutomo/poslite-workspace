import { z } from "zod";

import { API_BASE_URL, APP_VERSION, DEMO_ENABLED } from "@/config/env";
import { type BaseApi, pullAll } from "@/features/sync";
import { apiRequest } from "@/shared/api";
import { ensureDemoData, type PosDb, readState, writeState } from "@/shared/db";

/** The configured API (NEXT_PUBLIC_API_URL); tests pass their own with an injected fetch. */
export const DEFAULT_API: BaseApi = { baseUrl: API_BASE_URL, appVersion: APP_VERSION };
/** Whether this deployment offers the offline demo (15 · UX-01). */
export const IS_DEMO_ENABLED = DEMO_ENABLED;

const outletsSchema = z.array(z.object({ id: z.string(), code: z.string(), name: z.string() }));
const loginSchema = z.object({ token: z.string() });
const activationSchema = z.object({
  device: z.object({ id: z.string(), code: z.string(), outlet: z.object({ id: z.string() }) }),
  token: z.string(),
});

export interface Credentials {
  email: string;
  password: string;
}

/** Step 1 of activation: a manager signs in, only to list the outlets (the token is not kept). */
export async function loginManager(credentials: Credentials, deps: { api: BaseApi } = { api: DEFAULT_API }) {
  const { token } = await apiRequest(deps.api, "POST", "/auth/login", loginSchema, credentials);
  const outlets = await apiRequest({ ...deps.api, token }, "GET", "/outlets", outletsSchema);
  return { token, outlets };
}

/** Everything a device holds locally; wiped when it switches between demo and a real outlet. */
async function wipeLocalData(db: PosDb): Promise<void> {
  const keep = new Set(["printers"]);
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) if (!keep.has(table.name)) await table.clear();
  });
}

/**
 * Step 2 (03-offline-sync.md "Offline Auth"): the device gets its own long-lived token and code,
 * then pulls the outlet's master data. Demo data is removed first so it can never be synced.
 */
export async function activateDevice(
  input: Credentials & { outletId: string; deviceName: string },
  deps: { db: PosDb; api: BaseApi },
): Promise<void> {
  const { db } = deps;
  const activated = await apiRequest(deps.api, "POST", "/devices/activate", activationSchema, {
    email: input.email,
    password: input.password,
    outlet_id: input.outletId,
    device_name: input.deviceName,
    platform: typeof navigator === "undefined" ? "" : navigator.platform.slice(0, 30),
  });
  await wipeLocalData(db);
  await writeState(db, "device", {
    mode: "server",
    deviceId: activated.device.id,
    deviceCode: activated.device.code,
    outletId: activated.device.outlet.id,
    token: activated.token,
  });
  await pullAll({ db, api: deps.api });
}

/** Offline demo without a server: the prototype menu and demo cashiers (Siti 1234, Budi 9999). */
export async function startDemo(deps: { db: PosDb }): Promise<void> {
  await wipeLocalData(deps.db);
  await ensureDemoData(deps.db);
  await writeState(deps.db, "device", { mode: "demo" });
}

/** "Keluar dari demo" (15 · UX-01): back to activation. Only ever wipes a demo device. */
export async function exitDemo(deps: { db: PosDb }): Promise<void> {
  if ((await readState(deps.db, "device"))?.mode !== "demo") return;
  await wipeLocalData(deps.db);
}
