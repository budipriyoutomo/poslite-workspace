"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { getDb } from "@/shared/db";

/** Users allowed on this device (pulled from the server; demo data for now), by name. */
export function useDeviceUsers() {
  return useLiveQuery(async () => (await getDb().users.toArray()).sort((a, b) => a.name.localeCompare(b.name)), []);
}
