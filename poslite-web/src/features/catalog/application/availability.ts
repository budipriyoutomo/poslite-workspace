import { enqueueEvent } from "@/features/sync";
import { getDb, isManager, type PosDb } from "@/shared/db";
import { AppError } from "@/shared/errors";
import { newId } from "@/shared/id";

import { endOfBusinessDate } from "../domain/availability";

export interface AvailabilityDeps {
  db: PosDb;
  now: () => Date;
  newId: () => string;
}

const defaultDeps = (): AvailabilityDeps => ({ db: getDb(), now: () => new Date(), newId });

/**
 * Marks an item sold out (or available again) from the POS (P1-2): the grid changes at once, offline
 * too, and product.availability_changed goes to the server for the other devices. A cashier or a
 * manager may do it; a waiter may not.
 */
export async function markAvailability(
  input: { productId: string; isAvailable: boolean; untilEndOfDay: boolean; userId: string },
  deps: AvailabilityDeps = defaultDeps(),
): Promise<void> {
  const { db } = deps;
  await db.transaction("rw", [db.settings, db.users, db.availabilityOverrides, db.outbox], async () => {
    const user = await db.users.get(input.userId);
    if (!user || !(isManager(user.role) || user.role === "cashier")) throw new AppError("NOT_ALLOWED");
    const outlet = (await db.settings.get("outlet"))?.value;
    if (!outlet) throw new AppError("DEVICE_NOT_ACTIVATED");
    const now = deps.now();
    const until = !input.isAvailable && input.untilEndOfDay ? endOfBusinessDate(now, outlet.timezone, outlet.businessDayCutoff) : null;
    const changedAt = now.toISOString();
    await db.availabilityOverrides.put({ productId: input.productId, isAvailable: input.isAvailable, until, changedAt });
    await enqueueEvent(db, {
      id: deps.newId(),
      type: "product.availability_changed",
      aggregateId: input.productId,
      occurredAt: changedAt,
      payload: { product_id: input.productId, is_available: input.isAvailable, until, changed_by: input.userId },
    });
  });
}
