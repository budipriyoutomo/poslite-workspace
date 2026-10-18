import { connect as netConnect, type Socket } from "node:net";

import type { PrinterAddress } from "./printer-address.ts";

const DEFAULT_TIMEOUT_MS = 10_000;
/** After the job is flushed, how long to wait for the printer to close its side. */
const DEFAULT_LINGER_MS = 1_000;

/**
 * Opens TCP to the printer, writes the job and closes — the same as `nc printer 9100 < job.bin`.
 * Some printers never close their side, so a flushed job counts as done after a short linger.
 * Errors are codes the POS shows the cashier.
 */
export function sendRaw(
  address: PrinterAddress,
  data: Buffer,
  {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    lingerMs = DEFAULT_LINGER_MS,
    connect = netConnect,
  }: { timeoutMs?: number; lingerMs?: number; connect?: (port: number, host: string) => Socket } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    let isSettled = false;
    const settle = (error?: Error) => {
      if (isSettled) return;
      isSettled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };
    const socket = connect(address.port, address.host);
    socket.setTimeout(timeoutMs, () => settle(new Error("PRINTER_TIMEOUT")));
    socket.on("error", () => settle(new Error("PRINTER_UNREACHABLE")));
    socket.on("connect", () => socket.end(data));
    socket.on("finish", () => setTimeout(() => settle(), lingerMs).unref());
    socket.on("close", () => settle());
  });
}
