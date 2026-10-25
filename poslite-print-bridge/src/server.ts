import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type RequestListener, type Server, type ServerResponse } from "node:http";

import { Pairing } from "./pairing.ts";
import { isAllowed, type PrinterAddress, parsePrinterAddress } from "./printer-address.ts";
import { statusPage } from "./status-page.ts";

export interface BridgeConfig {
  /** Shared secret per outlet; the POS sends it as `Authorization: Bearer …`. */
  token: string;
  /** POS origins allowed to call the bridge; empty = any (the token still applies). */
  allowedOrigins: string[];
  /** `host:port` printers allowed; empty = private IPv4 addresses only. */
  printers: string[];
  version: string;
  /** P1-5: a 6-digit code on the local page pairs a POS instead of a typed token. */
  pairing?: Pairing;
  /** Whether the caller is this PC (the local page and test print are not for the LAN). */
  isLocal?: (req: IncomingMessage) => boolean;
}

export type SendRaw = (address: PrinterAddress, data: Buffer) => Promise<void>;

const MAX_BODY_BYTES = 1_000_000;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const STATUS_OF: Record<string, number> = { PRINTER_UNREACHABLE: 502, PRINTER_TIMEOUT: 504 };

const digest = (value: string) => createHash("sha256").update(value).digest();
const isTokenValid = (header: string | undefined, token: string) => {
  const given = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  return given !== "" && timingSafeEqual(digest(given), digest(token));
};

function json(res: ServerResponse, status: number, body: object) {
  res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
}

/** Reads the body up to the limit; a bigger body is drained and answered with 413 by the caller. */
function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) chunks.push(chunk);
    });
    req.on("end", () => resolve(size > MAX_BODY_BYTES ? null : Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const isLoopback = (req: IncomingMessage) => LOOPBACK.has(req.socket.remoteAddress ?? "");
const MAX_ERRORS = 20;
// ESC @ (reset), the text, feed 4 lines, GS V 1 (partial cut).
const testPage = (version: string) =>
  Buffer.concat([Buffer.from([0x1b, 0x40]), Buffer.from(`POSLite Print Bridge ${version}\nTest print OK\n${new Date().toISOString()}\n`, "latin1"), Buffer.from([0x1b, 0x64, 4, 0x1d, 0x56, 1])]);

function parseJson(body: string | null): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(body ?? "");
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseJob(body: string): { printer: PrinterAddress; data: Buffer } | null {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || !("printer" in value) || !("data" in value)) return null;
  const { printer, data } = value;
  if (typeof printer !== "string" || typeof data !== "string" || data === "" || !BASE64.test(data)) return null;
  const address = parsePrinterAddress(printer);
  return address && { printer: address, data: Buffer.from(data, "base64") };
}

/**
 * Print Bridge (04-printing.md): `POST /print { printer: "ip:port", data: base64 }` → raw TCP to the
 * printer. Jobs for one printer run one at a time so two tablets never interleave their bytes.
 * Never logs the token or the receipt data.
 */
export function createBridgeHandler(config: BridgeConfig, send: SendRaw): RequestListener {
  const queues = new Map<string, Promise<unknown>>();
  const pairing = config.pairing ?? new Pairing();
  const isLocal = config.isLocal ?? isLoopback;
  // Why the last jobs failed (printer and error code only: never the receipt bytes).
  const errors: { at: string; printer: string; error: string }[] = [];
  const failed = (printer: PrinterAddress, error: string) => {
    errors.unshift({ at: new Date().toISOString(), printer: `${printer.host}:${printer.port}`, error });
    errors.length = Math.min(errors.length, MAX_ERRORS);
  };
  const enqueue = (address: PrinterAddress, data: Buffer) => {
    const key = `${address.host.toLowerCase()}:${address.port}`;
    const job = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(() => send(address, data));
    queues.set(key, job);
    void job.finally(() => queues.get(key) === job && queues.delete(key)).catch(() => undefined);
    return job;
  };

  return async (req, res) => {
    const origin = req.headers.origin;
    const isOriginAllowed = !origin || config.allowedOrigins.length === 0 || config.allowedOrigins.includes(origin);
    if (origin && isOriginAllowed) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    const path = new URL(req.url ?? "/", "http://bridge").pathname;

    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Max-Age", "600");
      // Chrome's Private Network Access: a public HTTPS page calling a LAN/localhost address.
      if (req.headers["access-control-request-private-network"] === "true") res.setHeader("Access-Control-Allow-Private-Network", "true");
      return res.writeHead(isOriginAllowed ? 204 : 403).end();
    }
    if (req.method === "GET" && path === "/health") return json(res, 200, { ok: true, version: config.version });
    if (req.method === "GET" && path === "/") {
      if (!isLocal(req)) return json(res, 403, { error: "LOCAL_ONLY" });
      const page = statusPage({ version: config.version, pairing: pairing.current(), printers: config.printers, errors });
      return res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }).end(page);
    }
    if (req.method === "POST" && path === "/pair") {
      const body = parseJson(await readBody(req).catch(() => null));
      if (!isOriginAllowed) return json(res, 403, { error: "ORIGIN_NOT_ALLOWED" });
      const result = pairing.redeem(typeof body?.code === "string" ? body.code : "");
      if (result === "locked") return json(res, 429, { error: "PAIRING_LOCKED" });
      return result === "paired" ? json(res, 200, { token: config.token }) : json(res, 401, { error: "INVALID_CODE" });
    }
    if (req.method === "POST" && path === "/test-print") {
      if (!isLocal(req)) return json(res, 403, { error: "LOCAL_ONLY" });
      const body = parseJson(await readBody(req).catch(() => null));
      const address = typeof body?.printer === "string" ? parsePrinterAddress(body.printer) : null;
      if (!address) return json(res, 400, { error: "BAD_REQUEST" });
      if (!isAllowed(address, config.printers)) return json(res, 403, { error: "PRINTER_NOT_ALLOWED" });
      try {
        await enqueue(address, testPage(config.version));
        return json(res, 200, { ok: true });
      } catch (e) {
        const code = e instanceof Error && e.message in STATUS_OF ? e.message : "PRINTER_UNREACHABLE";
        failed(address, code);
        return json(res, STATUS_OF[code] ?? 502, { error: code });
      }
    }
    if (req.method !== "POST" || path !== "/print") return json(res, 404, { error: "NOT_FOUND" });

    const body = await readBody(req).catch(() => null);
    if (!isOriginAllowed) return json(res, 403, { error: "ORIGIN_NOT_ALLOWED" });
    if (!isTokenValid(req.headers.authorization, config.token)) return json(res, 401, { error: "UNAUTHORIZED" });
    if (body === null) return json(res, 413, { error: "TOO_LARGE" });
    const job = parseJob(body);
    if (!job) return json(res, 400, { error: "BAD_REQUEST" });
    if (!isAllowed(job.printer, config.printers)) return json(res, 403, { error: "PRINTER_NOT_ALLOWED" });

    try {
      await enqueue(job.printer, job.data);
      json(res, 200, { ok: true });
    } catch (e) {
      const code = e instanceof Error && e.message in STATUS_OF ? e.message : "PRINTER_UNREACHABLE";
      failed(job.printer, code);
      json(res, STATUS_OF[code] ?? 502, { error: code });
    }
  };
}

/** The bridge over plain HTTP (localhost); `main.ts` serves the same handler over HTTPS when configured. */
export const createBridgeServer = (config: BridgeConfig, send: SendRaw): Server => createServer(createBridgeHandler(config, send));
