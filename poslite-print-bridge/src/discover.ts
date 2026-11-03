import { connect, isIPv4 } from "node:net";
import { type NetworkInterfaceInfo, networkInterfaces } from "node:os";

import { DEFAULT_PORT, isPrivateIPv4, type PrinterAddress } from "./printer-address.ts";

export type Probe = (host: string, port: number, timeoutMs: number) => Promise<boolean>;

const DEADLINE_MS = 5_000;
const PROBE_TIMEOUT_MS = 600;
const CONCURRENCY = 64;

const toInt = (ip: string) => ip.split(".").reduce((n, part) => n * 256 + Number(part), 0);
const toIp = (n: number) => [24, 16, 8, 0].map((shift) => Math.floor(n / 2 ** shift) % 256).join(".");

/** True when something accepts a TCP connection on the port before the timeout. */
export const probeTcp: Probe = (host, port, timeoutMs) =>
  new Promise((resolve) => {
    const socket = connect(port, host);
    const done = (isOpen: boolean) => {
      socket.destroy();
      resolve(isOpen);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });

/**
 * The hosts to scan: each private IPv4 interface's subnet, but never more than the /24 the bridge's
 * own address is in, so a /16 office network is not swept. The bridge itself is left out.
 */
function hostsToScan(interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>): string[] {
  const hosts = new Set<string>();
  for (const info of Object.values(interfaces).flat()) {
    if (!info || info.family !== "IPv4" || info.internal || !isIPv4(info.address) || !isPrivateIPv4(info.address) || info.address.startsWith("127.")) continue;
    const address = toInt(info.address);
    const mask = toInt(info.netmask);
    const network = address - (address % (2 ** 32 - mask));
    const broadcast = network + (2 ** 32 - mask) - 1;
    const block = address - (address % 256);
    for (let n = Math.max(network, block) + 1; n < Math.min(broadcast, block + 255); n++) if (n !== address) hosts.add(toIp(n));
  }
  return [...hosts];
}

/**
 * Finds printers on the bridge's LAN (15 · UX-08): what answers on port 9100, within a time limit
 * (≤ 5 s), because a browser cannot scan the network itself. What answered by then is returned.
 */
export async function discoverPrinters({
  interfaces = networkInterfaces(),
  probe = probeTcp,
  port = DEFAULT_PORT,
  deadlineMs = DEADLINE_MS,
}: { interfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>; probe?: Probe; port?: number; deadlineMs?: number } = {}): Promise<PrinterAddress[]> {
  const queue = hostsToScan(interfaces);
  const found: PrinterAddress[] = [];
  const worker = async () => {
    for (let host = queue.shift(); host !== undefined; host = queue.shift()) if (await probe(host, port, PROBE_TIMEOUT_MS)) found.push({ host, port });
  };
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<void>((resolve) => (timer = setTimeout(resolve, deadlineMs)));
  await Promise.race([Promise.all(Array.from({ length: CONCURRENCY }, worker)), deadline]);
  clearTimeout(timer);
  queue.length = 0; // workers still waiting on a probe start no new ones
  return [...found].sort((a, b) => toInt(a.host) - toInt(b.host));
}
