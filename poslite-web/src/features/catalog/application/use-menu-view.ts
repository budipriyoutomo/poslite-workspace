"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { getDb, type MenuView } from "@/shared/db";

import { menuViewOf, setMenuView } from "./menu-view";

/** This device's menu view, and a setter (15 · UX-06). Compact while loading. */
export function useMenuView(): [MenuView, (view: MenuView) => void] {
  const view = useLiveQuery(() => menuViewOf(getDb()), []) ?? "compact";
  return [view, (next) => void setMenuView(getDb(), next)];
}
