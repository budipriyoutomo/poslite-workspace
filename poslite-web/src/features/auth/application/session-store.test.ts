import { describe, expect, it } from "vitest";

import { createTestDb } from "../../../../tests/support/test-db";
import { IDLE_LOCK_MS, createSessionStore } from "./session-store";
import { sessionStorageIn } from "../infrastructure/session-storage";

const siti = { id: "01J8Z000000000000000000CA1", name: "Siti", role: "cashier" as const };
const at = (ms: number) => () => new Date(Date.UTC(2026, 8, 25, 3) + ms);
const settle = () => new Promise((r) => setTimeout(r, 20));

describe("session store", () => {
  it("keeps the cashier logged in across a reload", async () => {
    const db = createTestDb();
    createSessionStore(sessionStorageIn(() => db), at(0)).getState().login(siti);
    await settle();

    const reloaded = createSessionStore(sessionStorageIn(() => db), at(60_000));
    await reloaded.persist.rehydrate();
    expect(reloaded.getState().user).toEqual(siti);
  });

  it("locks after the idle limit, also when the app was closed meanwhile", async () => {
    const db = createTestDb();
    createSessionStore(sessionStorageIn(() => db), at(0)).getState().login(siti);
    await settle();

    const later = createSessionStore(sessionStorageIn(() => db), at(IDLE_LOCK_MS + 1));
    await later.persist.rehydrate();
    later.getState().lockIfIdle();
    expect(later.getState().user).toBeNull();
  });

  it("activity postpones the idle lock", () => {
    let now = 0;
    const store = createSessionStore(sessionStorageIn(() => createTestDb()), () => new Date(now));
    store.getState().login(siti);
    now = IDLE_LOCK_MS - 1_000;
    store.getState().touch();
    now = IDLE_LOCK_MS + 1_000;
    store.getState().lockIfIdle();
    expect(store.getState().user).toEqual(siti);
  });

  it("locks on demand", () => {
    const store = createSessionStore(sessionStorageIn(() => createTestDb()), at(0));
    store.getState().login(siti);
    store.getState().lock();
    expect(store.getState().user).toBeNull();
  });
});
