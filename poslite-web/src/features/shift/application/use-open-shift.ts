"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { getOpenShift } from "./shift";

/** The device's open shift: undefined while loading, null when no shift is open. */
export function useOpenShift() {
  return useLiveQuery(async () => (await getOpenShift()) ?? null, []);
}
