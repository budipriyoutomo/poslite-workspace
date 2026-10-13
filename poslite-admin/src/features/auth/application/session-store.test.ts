import { beforeEach, describe, expect, it } from "vitest";

import { createSessionStore, isSignedIn } from "./session-store";

const RESULT = {
  token: "tok",
  expires_at: "2026-09-26T15:00:00Z",
  user: { id: "U1", name: "Budi", role: "owner" },
  tenant: { id: "T1", slug: "maharasa", name: "Warung Maharasa", status: "active" },
};

beforeEach(() => localStorage.clear());

describe("session store", () => {
  it("keeps the back-office session across a reload", async () => {
    createSessionStore().getState().signIn(RESULT);

    const reloaded = createSessionStore();
    await reloaded.persist.rehydrate();

    expect(reloaded.getState().session?.tenant.name).toBe("Warung Maharasa");
  });

  it("treats an expired token as signed out", () => {
    const store = createSessionStore();
    store.getState().signIn(RESULT);

    expect(isSignedIn(store.getState().session, new Date("2026-09-26T14:59:00Z"))).toBe(true);
    expect(isSignedIn(store.getState().session, new Date("2026-09-26T15:00:01Z"))).toBe(false);
  });

  it("signs out", () => {
    const store = createSessionStore();
    store.getState().signIn(RESULT);
    store.getState().signOut();
    expect(store.getState().session).toBeNull();
  });

  it("keeps the active brand, cleared by a new sign-in", async () => {
    const store = createSessionStore();
    store.getState().signIn(RESULT);
    expect(store.getState().session?.brandId).toBeNull();

    store.getState().selectBrand("B1");
    const reloaded = createSessionStore();
    await reloaded.persist.rehydrate();
    expect(reloaded.getState().session?.brandId).toBe("B1");

    store.getState().signIn(RESULT);
    expect(store.getState().session?.brandId).toBeNull();
  });
});
