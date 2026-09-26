import { describe, expect, it, vi } from "vitest";

import { type QrisCharge, type QrisClient, waitForQrisPayment } from "./dynamic-qris";

const charge = (status: QrisCharge["status"]): QrisCharge => ({ id: "01K5ZK00000000000000000001", amount: 41_580, status, qrString: "FAKEQRIS|x|41580", expiresAt: "2026-09-27T03:15:00Z" });

function client(statuses: QrisCharge["status"][]): QrisClient {
  const queue = [...statuses];
  return {
    create: vi.fn(async () => charge("pending")),
    status: vi.fn(async () => charge(queue.length > 1 ? queue.shift()! : queue[0]!)),
  };
}

const noWait = { intervalMs: 0, timeoutMs: 60_000, sleep: async () => undefined };

describe("waitForQrisPayment", () => {
  it("polls until the gateway confirms the payment", async () => {
    const c = client(["pending", "pending", "paid"]);

    const result = await waitForQrisPayment(c, "01K5ZK00000000000000000001", noWait);

    expect(result.status).toBe("paid");
    expect(c.status).toHaveBeenCalledTimes(3);
  });

  it("stops when the charge expires", async () => {
    expect((await waitForQrisPayment(client(["pending", "expired"]), "01K5ZK00000000000000000001", noWait)).status).toBe("expired");
  });

  it("gives up after the timeout and reports it still pending", async () => {
    let now = 0;
    const result = await waitForQrisPayment(client(["pending"]), "01K5ZK00000000000000000001", {
      intervalMs: 2_000,
      timeoutMs: 10_000,
      sleep: async (ms) => void (now += ms),
      now: () => now,
    });

    expect(result.status).toBe("pending");
  });

  it("can be cancelled by the cashier", async () => {
    const controller = new AbortController();
    const c = client(["pending"]);
    controller.abort();

    await expect(waitForQrisPayment(c, "01K5ZK00000000000000000001", { ...noWait, signal: controller.signal })).rejects.toThrow("cancelled");
  });
});
