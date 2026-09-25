import type { StateStorage } from "zustand/middleware";

import { type PosDb, readState, writeState } from "@/shared/db";

/** zustand persist storage for the session in IndexedDB (syncState "session"). */
export function sessionStorageIn(getDb: () => PosDb): StateStorage {
  // Prerendering runs on the server without IndexedDB.
  const isAvailable = () => typeof window !== "undefined";
  return {
    getItem: async () => (isAvailable() ? ((await readState(getDb(), "session")) ?? null) : null),
    setItem: async (_name, value) => {
      if (isAvailable()) await writeState(getDb(), "session", value);
    },
    removeItem: async () => {
      if (isAvailable()) await getDb().syncState.delete("session");
    },
  };
}
