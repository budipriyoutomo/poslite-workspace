import { APP_VERSION } from "@/config/env";
import type { PosDb } from "@/shared/db";
import { getDb, readState } from "@/shared/db";
import { AppError } from "@/shared/errors";

import { canonicalJson } from "../domain/canonical-json";

export interface ExportDeps {
  db: PosDb;
  now: () => Date;
}

const defaultDeps = (): ExportDeps => ({ db: getDb(), now: () => new Date() });

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function stamp(at: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}`;
}

/**
 * Emergency export (ADR-024): every event still in the outbox — pending, failed or dead — as a
 * file a manager imports in the back-office. Works offline and after the device was revoked;
 * nothing is removed from the outbox.
 */
export async function buildDeviceExport(deps: ExportDeps = defaultDeps()): Promise<{ filename: string; content: string }> {
  const { db } = deps;
  const [device, outlet, rows] = await Promise.all([readState(db, "device"), db.settings.get("outlet"), db.outbox.orderBy("seq").toArray()]);
  if (device?.mode !== "server" || !outlet) throw new AppError("NOT_ACTIVATED");
  const events = rows.map((e) => ({ id: e.id, type: e.type, aggregate_id: e.aggregateId, occurred_at: e.occurredAt, payload: e.payload }));
  const now = deps.now();
  const doc = {
    format: "poslite-device-export",
    version: 1,
    exported_at: now.toISOString(),
    app_version: APP_VERSION,
    tenant_id: null, // the device does not know its company id; the server fences it by RLS
    outlet_id: outlet.value.outletId,
    device_id: device.deviceId,
    device_code: device.deviceCode,
    events,
    checksum: await sha256Hex(canonicalJson(events)),
  };
  return { filename: `poslite-export-${outlet.value.outletCode}${device.deviceCode}-${stamp(now, outlet.value.timezone)}.json`, content: JSON.stringify(doc, null, 2) };
}
