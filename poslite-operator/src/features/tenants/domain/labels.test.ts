import { describe, expect, it } from "vitest";

import { errorMessage, invoiceLabel, roleLabels, subscriptionLabel, tenantStatusLabel } from "./labels";

describe("labels", () => {
  it("names subscription, invoice and role codes", () => {
    expect(subscriptionLabel("past_due")).toBe("Menunggak");
    expect(subscriptionLabel(null)).toBe("—");
    expect(invoiceLabel("paid")).toBe("Lunas");
    expect(roleLabels(["owner", "cashier"])).toBe("Owner, Kasir");
    expect(roleLabels([])).toBe("—");
  });

  it("tells a billing suspension from a manual one", () => {
    expect(tenantStatusLabel("suspended", "billing")).toBe("Ditangguhkan · tagihan");
    expect(tenantStatusLabel("suspended", "manual")).toBe("Ditangguhkan");
    expect(tenantStatusLabel("active", null)).toBe("Aktif");
  });

  it("explains known errors and falls back to the server message", () => {
    expect(errorMessage("LAST_OWNER", "x")).toMatch(/Owner aktif terakhir/);
    expect(errorMessage("SOMETHING_ELSE", "Server says no")).toBe("Server says no");
    expect(errorMessage(undefined, "Server says no")).toBe("Server says no");
  });
});
