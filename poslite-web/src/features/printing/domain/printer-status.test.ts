import { describe, expect, it } from "vitest";

import { type PrinterJob, printerStatus } from "./printer-status";

let clock = 0;
const job = (status: PrinterJob["status"], orderId = "B1", role: PrinterJob["role"] = "kitchen"): PrinterJob => ({
  role,
  status,
  orderId,
  createdAt: new Date(Date.UTC(2026, 10, 3, 10, 0, clock++)).toISOString(),
});

describe("printerStatus (15 · UX-08)", () => {
  it("is not set up for a station without a printer", () => {
    expect(printerStatus("kitchen", undefined, [])).toEqual({ state: "unset" });
  });

  it("is ready for the receipt, which falls back to the system print dialog", () => {
    expect(printerStatus("receipt", undefined, [])).toEqual({ state: "ready" });
  });

  it("is ready when the last job printed", () => {
    expect(printerStatus("kitchen", { driver: "bridge" }, [job("failed"), job("printed")])).toEqual({ state: "ready" });
  });

  it("is unreachable after a failure, counting each ticket waiting once however often it was retried", () => {
    const jobs = [job("printed", "B0"), job("failed", "B1"), job("failed", "B2"), job("failed", "B1")];
    expect(printerStatus("kitchen", { driver: "bridge" }, jobs)).toEqual({ state: "unreachable", waiting: 2 });
  });

  it("only looks at its own role's jobs", () => {
    expect(printerStatus("kitchen", { driver: "bridge" }, [job("printed"), job("failed", "B2", "bar")])).toEqual({ state: "ready" });
  });

  it("counts a failed test print as unreachable with no ticket waiting", () => {
    expect(printerStatus("bar", { driver: "web-serial" }, [job("failed", "test-page", "bar")])).toEqual({ state: "unreachable", waiting: 0 });
  });

  it("reads jobs from before the role was recorded as the receipt printer's", () => {
    expect(printerStatus("receipt", { driver: "web-usb" }, [{ ...job("failed", "O1"), role: undefined }])).toEqual({ state: "unreachable", waiting: 1 });
  });
});
