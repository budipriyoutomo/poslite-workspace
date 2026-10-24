"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";

import { getDb, readState } from "@/shared/db";

import { sellsNow } from "../domain/availability";

/** A sold-out mark may lift by itself (P1-2): look again every minute. */
function useMinute(): number {
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60_000));
  useEffect(() => {
    const timer = setInterval(() => setMinute(Math.floor(Date.now() / 60_000)), 15_000);
    return () => clearInterval(timer);
  }, []);
  return minute;
}

/** Master data for the sell screen; re-renders when sync pull writes new rows or a sold-out mark changes. */
export function useCatalog() {
  const minute = useMinute();
  return useLiveQuery(async () => {
    const db = getDb();
    const [categories, products, groups, mediaBaseUrl, overrides] = await Promise.all([
      db.categories.orderBy("sortOrder").toArray(),
      db.products.toArray(),
      db.modifierGroups.toArray(),
      readState(db, "mediaBaseUrl"),
      db.availabilityOverrides.toArray(),
    ]);
    const overrideOf = new Map(overrides.map((o) => [o.productId, o]));
    const now = new Date();
    return {
      categories,
      products: products.map((p) => ({ ...p, isAvailable: sellsNow(p, overrideOf.get(p.id), now) })).sort((a, b) => a.name.localeCompare(b.name)),
      groupsById: new Map(groups.map((g) => [g.id, g])),
      categoryNameById: new Map(categories.map((c) => [c.id, c.name])),
      mediaBaseUrl: mediaBaseUrl ?? null,
    };
  }, [minute]);
}

export type Catalog = NonNullable<ReturnType<typeof useCatalog>>;
