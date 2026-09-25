import { describe, expect, it } from "vitest";

import { INITIAL_LOCKOUT, isLocked, registerFailure, registerSuccess } from "./pin-lockout";

const at = (iso: string) => new Date(iso);
const failTimes = (n: number, when = at("2026-09-25T03:00:00Z")) =>
  Array.from({ length: n }).reduce<typeof INITIAL_LOCKOUT>((s) => registerFailure(s, when), INITIAL_LOCKOUT);

describe("PIN lockout", () => {
  it("is not locked after four wrong PINs", () => {
    expect(isLocked(failTimes(4), at("2026-09-25T03:00:00Z"))).toBe(false);
  });

  it("locks for one minute after the fifth wrong PIN", () => {
    const state = failTimes(5);
    expect(isLocked(state, at("2026-09-25T03:00:59Z"))).toBe(true);
    expect(isLocked(state, at("2026-09-25T03:01:00Z"))).toBe(false);
  });

  it("doubles the lock for every further five wrong PINs", () => {
    const state = failTimes(10);
    expect(state.lockedUntil).toBe("2026-09-25T03:02:00.000Z");
  });

  it("resets after a correct PIN", () => {
    expect(registerSuccess()).toEqual(INITIAL_LOCKOUT);
  });
});
