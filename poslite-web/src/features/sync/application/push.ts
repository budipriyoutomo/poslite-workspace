import { apiRequest, NetworkError } from "@/shared/api";
import type { OutboxRow, PosDb } from "@/shared/db";

import { pushResultSchema } from "../infrastructure/push-schemas";
import { type BaseApi, deviceApi, serverDevice } from "./pull";

const BATCH_SIZE = 50; // server limit per request
const FIRST_RETRY_MS = 2_000;
const MAX_RETRY_MS = 5 * 60_000;

export interface PushDeps {
  db: PosDb;
  api: BaseApi;
  now: () => Date;
}

function backoff(attempts: number, now: Date): string {
  const delay = Math.min(FIRST_RETRY_MS * 2 ** (attempts - 1), MAX_RETRY_MS);
  return new Date(now.getTime() + delay).toISOString();
}

async function nextBatch(db: PosDb, now: Date): Promise<OutboxRow[]> {
  // [status+seq]: pending/failed in send order without scanning the whole outbox (Fase 0 spike).
  const due = (row: OutboxRow) => !row.nextAttemptAt || row.nextAttemptAt <= now.toISOString();
  const pending = await db.outbox.where("[status+seq]").between(["pending", -Infinity], ["pending", Infinity]).toArray();
  const failed = await db.outbox.where("[status+seq]").between(["failed", -Infinity], ["failed", Infinity]).toArray();
  return [...pending, ...failed]
    .filter(due)
    .sort((a, b) => a.seq! - b.seq!)
    .slice(0, BATCH_SIZE);
}

/**
 * Sends the outbox to POST /sync/push in batches (03-offline-sync.md "Algoritma push").
 * accepted/duplicate/flagged = stored on the server → removed; rejected → dead (a manager can
 * resend it); no response or 5xx → failed with backoff (the server rolled the batch back).
 */
export async function pushOutbox(deps: PushDeps): Promise<{ sent: number; failed: number }> {
  const { db } = deps;
  const api = deviceApi(deps.api, await serverDevice(db));
  let sent = 0;
  for (;;) {
    const now = deps.now();
    const batch = await nextBatch(db, now);
    if (batch.length === 0) return { sent, failed: 0 };

    let response;
    try {
      response = await apiRequest(api, "POST", "/sync/push", pushResultSchema, {
        events: batch.map((e) => ({ id: e.id, type: e.type, aggregate_id: e.aggregateId, occurred_at: e.occurredAt, payload: e.payload })),
      });
    } catch (e) {
      if (!(e instanceof NetworkError) && !(e as { isRetryable?: boolean }).isRetryable) throw e;
      await db.transaction("rw", db.outbox, async () => {
        for (const row of batch) {
          const attempts = row.attempts + 1;
          await db.outbox.update(row.seq!, { status: "failed", attempts, lastError: String(e), nextAttemptAt: backoff(attempts, now) });
        }
      });
      return { sent, failed: batch.length };
    }

    const byId = new Map(batch.map((row) => [row.id, row]));
    await db.transaction("rw", [db.outbox, db.orders, db.refunds], async () => {
      for (const result of response.results) {
        const row = byId.get(result.id);
        if (!row) continue;
        if (result.status === "rejected") {
          await db.outbox.update(row.seq!, { status: "dead", attempts: row.attempts + 1, lastError: `${result.code}: ${result.message ?? ""}`.trim() });
          continue;
        }
        await db.outbox.delete(row.seq!);
        const synced = { syncStatus: "synced" as const, ...(result.flags ? { flags: result.flags } : {}) };
        if (row.type === "order.placed") await db.orders.update(row.aggregateId, synced);
        if (row.type === "order.refunded") await db.refunds.update(row.aggregateId, synced);
        sent++;
      }
    });
  }
}
