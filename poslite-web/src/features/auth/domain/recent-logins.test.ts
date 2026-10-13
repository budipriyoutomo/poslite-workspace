import { describe, expect, it } from "vitest";

import { MAX_RECENT_LOGINS, orderForLockScreen, rememberLogin } from "./recent-logins";

const user = (id: string, name: string) => ({ id, name });

describe("rememberLogin", () => {
  it("puts the user who just logged in first", () => {
    expect(rememberLogin(["a", "b"], "c")).toEqual(["c", "a", "b"]);
  });

  it("moves a returning user to the front without duplicating them", () => {
    expect(rememberLogin(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
  });

  it("keeps only the most recent users", () => {
    const many = Array.from({ length: MAX_RECENT_LOGINS }, (_, i) => `u${i}`);
    expect(rememberLogin(many, "new")).toEqual(["new", ...many.slice(0, MAX_RECENT_LOGINS - 1)]);
  });
});

describe("orderForLockScreen", () => {
  const users = [user("a", "Andi"), user("b", "Budi"), user("s", "Siti"), user("d", "Dewi")];

  it("lists recent users first, most recent on top, then everyone else by name", () => {
    expect(orderForLockScreen(users, ["s", "b"]).map((u) => u.name)).toEqual(["Siti", "Budi", "Andi", "Dewi"]);
  });

  it("lists everyone by name on a device nobody has logged in to yet", () => {
    expect(orderForLockScreen(users, []).map((u) => u.name)).toEqual(["Andi", "Budi", "Dewi", "Siti"]);
  });

  it("skips recent users who are no longer on the device", () => {
    expect(orderForLockScreen(users, ["gone", "d"]).map((u) => u.name)).toEqual(["Dewi", "Andi", "Budi", "Siti"]);
  });
});
