import { describe, expect, it } from "vitest";

import { actionLabel, describeDetail } from "./actions";

describe("actionLabel", () => {
  it("names known actions in Indonesian", () => {
    expect(actionLabel("user.reset_password")).toBe("Reset password user");
  });

  it("keeps an unknown action as it is", () => {
    expect(actionLabel("tenant.rename")).toBe("tenant.rename");
  });
});

describe("describeDetail", () => {
  it("joins the name, email and days", () => {
    expect(describeDetail({ name: "Budi" })).toBe("Budi");
    expect(describeDetail({ email: "rina@poslite.id" })).toBe("rina@poslite.id");
    expect(describeDetail({ days: 7 })).toBe("+7 hari");
  });

  it("is empty without known fields", () => {
    expect(describeDetail({ other: true })).toBe("");
  });
});
