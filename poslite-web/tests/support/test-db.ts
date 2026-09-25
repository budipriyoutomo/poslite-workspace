import { IDBFactory, IDBKeyRange } from "fake-indexeddb";

import { PosDb } from "@/shared/db";

/** A fresh, isolated in-memory IndexedDB per call — no state leaks between tests. */
export function createTestDb(): PosDb {
  return new PosDb("poslite-test", { indexedDB: new IDBFactory(), IDBKeyRange });
}
