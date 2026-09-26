import { type PosDb, readState, writeState } from "@/shared/db";

import { pullAll } from "./pull";
import { type PushDeps, pushOutbox } from "./push";

/**
 * One sync round (03-offline-sync.md): push first — sales reach the server as early as possible —
 * then pull master data. A demo device has no server and never syncs.
 */
export async function runSync(deps: PushDeps): Promise<void> {
  if ((await readState(deps.db, "device"))?.mode !== "server") return;
  await pushOutbox(deps);
  await pullAll(deps);
  await writeState(deps.db, "lastSyncAt", deps.now().toISOString());
}

/** A manager fixed the cause (e.g. added the cashier to the outlet): send dead events again. */
export async function resendDead(db: PosDb): Promise<void> {
  await db.transaction("rw", db.outbox, async () => {
    const dead = await db.outbox.where("[status+seq]").between(["dead", -Infinity], ["dead", Infinity]).toArray();
    for (const row of dead) {
      await db.outbox.put({ ...row, status: "pending", attempts: 0, lastError: undefined, nextAttemptAt: undefined });
    }
  });
}
