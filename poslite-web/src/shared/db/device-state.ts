import type { PosDb } from "./db";
import type { SyncStateRow } from "./rows";

type StateKey = SyncStateRow["key"];
type StateValue<K extends StateKey> = Extract<SyncStateRow, { key: K }>["value"];

/** Typed access to the key/value syncState table (Dexie's get() cannot narrow a union by key). */
export async function readState<K extends StateKey>(db: PosDb, key: K): Promise<StateValue<K> | undefined> {
  const row = await db.syncState.get(key);
  return row?.value as StateValue<K> | undefined;
}

export async function writeState<K extends StateKey>(db: PosDb, key: K, value: StateValue<K>): Promise<void> {
  await db.syncState.put({ key, value } as SyncStateRow);
}
