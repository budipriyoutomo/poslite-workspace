import { type MenuView, type PosDb, readState, writeState } from "@/shared/db";

/** "Ringkas / Foto" (15 · UX-06): per device, compact until a manager picks photos. */
export async function menuViewOf(db: PosDb): Promise<MenuView> {
  return (await readState(db, "menuView")) ?? "compact";
}

export async function setMenuView(db: PosDb, view: MenuView): Promise<void> {
  await writeState(db, "menuView", view);
}
