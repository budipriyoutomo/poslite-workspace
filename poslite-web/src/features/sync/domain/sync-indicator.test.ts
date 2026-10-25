import { describe, expect, it } from "vitest";

import { type SyncFacts, syncIndicator } from "./sync-indicator";

const NOW = new Date("2026-10-25T10:00:00Z");
const facts = (over: Partial<SyncFacts> = {}): SyncFacts => ({
  mode: "server",
  isOnline: true,
  pending: 0,
  dead: 0,
  lastSyncAt: "2026-10-25T09:55:00Z",
  now: NOW,
  ...over,
});

describe("syncIndicator (15 · UX-01)", () => {
  it("reports synced with the minutes since the last sync", () => {
    expect(syncIndicator(facts())).toEqual({ state: "synced", minutesAgo: 5 });
  });

  it("reports synced without an age on a device that has not synced yet", () => {
    expect(syncIndicator(facts({ lastSyncAt: null }))).toEqual({ state: "synced", minutesAgo: null });
  });

  it("reports sending while events wait online", () => {
    expect(syncIndicator(facts({ pending: 3 }))).toEqual({ state: "sending", pending: 3 });
  });

  it("reports offline with the waiting events", () => {
    expect(syncIndicator(facts({ isOnline: false, pending: 2 }))).toEqual({ state: "offline", pending: 2 });
  });

  it("reports offline even with nothing waiting", () => {
    expect(syncIndicator(facts({ isOnline: false }))).toEqual({ state: "offline", pending: 0 });
  });

  it("reports stale when events wait and the last sync is over 2 hours old", () => {
    expect(syncIndicator(facts({ isOnline: false, pending: 1, lastSyncAt: "2026-10-25T07:59:00Z" }))).toEqual({
      state: "stale",
      since: "2026-10-25T07:59:00Z",
    });
  });

  it("is not stale at exactly 2 hours", () => {
    expect(syncIndicator(facts({ pending: 1, lastSyncAt: "2026-10-25T08:00:00Z" })).state).toBe("sending");
  });

  it("reports stale when events wait on a device that never synced", () => {
    expect(syncIndicator(facts({ pending: 1, lastSyncAt: null }))).toEqual({ state: "stale", since: null });
  });

  it("puts failed events before everything else", () => {
    expect(syncIndicator(facts({ isOnline: false, pending: 4, dead: 2, lastSyncAt: null }))).toEqual({ state: "failed", dead: 2 });
  });

  it("reports demo on a demo device whatever the outbox holds", () => {
    expect(syncIndicator(facts({ mode: "demo", pending: 5, dead: 1 }))).toEqual({ state: "demo" });
  });
});
