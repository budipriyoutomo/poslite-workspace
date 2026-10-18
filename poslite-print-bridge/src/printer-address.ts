import { isIPv4 } from "node:net";

export interface PrinterAddress {
  host: string;
  port: number;
}

/** Raw ESC/POS printing port ("JetDirect"). */
export const DEFAULT_PORT = 9100;

/** `host` or `host:port` (IPv4 or a host name), as the POS sends it. */
export function parsePrinterAddress(value: string): PrinterAddress | null {
  const match = /^([A-Za-z0-9.-]+)(?::(\d{1,5}))?$/.exec(value.trim());
  if (!match) return null;
  const port = match[2] === undefined ? DEFAULT_PORT : Number(match[2]);
  if (port < 1 || port > 65_535) return null;
  return { host: match[1]!, port };
}

function isPrivateIPv4(host: string): boolean {
  if (!isIPv4(host)) return false;
  const [a, b] = host.split(".").map(Number) as [number, number];
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * Without an allowlist only private IPv4 addresses are reachable, so a leaked token cannot turn the
 * bridge into a relay to the internet. Host names (DNS can point anywhere) need the allowlist.
 */
export function isAllowed(address: PrinterAddress, allowlist: string[]): boolean {
  if (allowlist.length === 0) return isPrivateIPv4(address.host);
  return allowlist.some((entry) => {
    const allowed = parsePrinterAddress(entry);
    return allowed !== null && allowed.host.toLowerCase() === address.host.toLowerCase() && allowed.port === address.port;
  });
}
