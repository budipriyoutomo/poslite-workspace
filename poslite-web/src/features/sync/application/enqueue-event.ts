import type { OutboxEventType, PosDb } from "@/shared/db";

import { eventPayloads } from "../infrastructure/event-payloads";
import { kickSync } from "./sync-runner";

export interface NewEvent {
  id: string; // ULID = idempotency key on the server
  type: OutboxEventType;
  aggregateId: string;
  occurredAt: string;
  payload: unknown;
}

/**
 * Validates the payload against the push contract and appends it to the outbox. Call it inside the
 * same Dexie transaction that writes the data, so data and event are stored together or not at all.
 */
export async function enqueueEvent(db: PosDb, event: NewEvent): Promise<void> {
  const payload = eventPayloads[event.type].parse(event.payload);
  await db.outbox.add({ ...event, payload, status: "pending", attempts: 0, createdAt: event.occurredAt });
  kickSync(); // debounced: the sync runs after this transaction has committed
}
