import type { StateStorage } from "zustand/middleware";

import { type PosDb, readState, writeState } from "@/shared/db";

/** zustand persist storage backed by IndexedDB (syncState "cart"), not localStorage. */
export function cartStorage(getDb: () => PosDb): StateStorage {
  // Prerendering runs on the server without IndexedDB: start empty and hydrate in the browser.
  const isAvailable = () => typeof window !== "undefined";
  return {
    getItem: async () => (isAvailable() ? ((await readState(getDb(), "cart")) ?? null) : null),
    setItem: async (_name, value) => {
      if (isAvailable()) await writeState(getDb(), "cart", value);
    },
    removeItem: async () => {
      if (isAvailable()) await getDb().syncState.delete("cart");
    },
  };
}
