"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { getDb } from "@/shared/db";

/** Master data for the sell screen; re-renders when sync pull writes new rows. */
export function useCatalog() {
  return useLiveQuery(async () => {
    const db = getDb();
    const [categories, products, groups] = await Promise.all([db.categories.orderBy("sortOrder").toArray(), db.products.toArray(), db.modifierGroups.toArray()]);
    return {
      categories,
      products: products.sort((a, b) => a.name.localeCompare(b.name)),
      groupsById: new Map(groups.map((g) => [g.id, g])),
      categoryNameById: new Map(categories.map((c) => [c.id, c.name])),
    };
  }, []);
}

export type Catalog = NonNullable<ReturnType<typeof useCatalog>>;
