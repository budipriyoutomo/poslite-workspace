import type { QrisCharge, QrisClient } from "../domain/qris";

export type { QrisCharge, QrisClient };

interface WaitOptions {
  intervalMs: number;
  timeoutMs: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  signal?: AbortSignal;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Poll the charge until the gateway confirms it, it expires, or the wait times out (still pending). */
export async function waitForQrisPayment(client: QrisClient, id: string, options: WaitOptions): Promise<QrisCharge> {
  const { intervalMs, timeoutMs, sleep = realSleep, now = Date.now, signal } = options;
  const deadline = now() + timeoutMs;
  for (;;) {
    if (signal?.aborted) throw new Error("cancelled");
    const charge = await client.status(id);
    if (charge.status !== "pending" || now() >= deadline) return charge;
    await sleep(intervalMs);
  }
}
