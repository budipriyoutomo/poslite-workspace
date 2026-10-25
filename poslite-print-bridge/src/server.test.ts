import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it } from "node:test";

import type { PrinterAddress } from "./printer-address.ts";
import { Pairing } from "./pairing.ts";
import { type BridgeConfig, createBridgeServer } from "./server.ts";

const CONFIG: BridgeConfig = { token: "s3cret", allowedOrigins: [], printers: [], version: "0.1.0" };
const POS = "https://pos.poslite.id";

let stop: (() => Promise<void>) | undefined;
afterEach(async () => {
  await stop?.();
  stop = undefined;
});

async function start(config: Partial<BridgeConfig> = {}, send: (address: PrinterAddress, data: Buffer) => Promise<void> = async () => undefined) {
  const jobs: { address: PrinterAddress; data: Buffer }[] = [];
  const server = createBridgeServer({ ...CONFIG, ...config }, async (address, data) => {
    jobs.push({ address, data });
    await send(address, data);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  stop = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return { url, jobs };
}

const print = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${url}/print`, {
    method: "POST",
    headers: { Authorization: "Bearer s3cret", "Content-Type": "application/json", Origin: POS, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const JOB = { printer: "192.168.1.50:9100", data: Buffer.from([0x1b, 0x40, 0x41]).toString("base64") };

describe("Print Bridge server", () => {
  it("answers a health check without a token", async () => {
    const { url } = await start();

    const response = await fetch(`${url}/health`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, version: "0.1.0" });
  });

  it("sends the decoded bytes to the printer", async () => {
    const { url, jobs } = await start();

    const response = await print(url, JOB);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.deepEqual(jobs, [{ address: { host: "192.168.1.50", port: 9100 }, data: Buffer.from([0x1b, 0x40, 0x41]) }]);
  });

  it("refuses a missing or wrong token", async () => {
    const { url, jobs } = await start();

    assert.equal((await print(url, JOB, { Authorization: "Bearer nope" })).status, 401);
    const response = await print(url, JOB, { Authorization: "" });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "UNAUTHORIZED" });
    assert.deepEqual(jobs, []);
  });

  it("refuses a malformed job", async () => {
    const { url } = await start();

    for (const body of ["{", { printer: "192.168.1.50" }, { printer: "http://x", data: "AA==" }, { printer: "192.168.1.50", data: "!!" }]) {
      const response = await print(url, body);
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.deepEqual(await response.json(), { error: "BAD_REQUEST" });
    }
  });

  it("refuses printers outside the local network", async () => {
    const { url, jobs } = await start();

    const response = await print(url, { ...JOB, printer: "8.8.8.8:9100" });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "PRINTER_NOT_ALLOWED" });
    assert.deepEqual(jobs, []);
  });

  it("passes on why the printer could not be reached", async () => {
    const unreachable = await start({}, async () => {
      throw new Error("PRINTER_UNREACHABLE");
    });
    const response = await print(unreachable.url, JOB);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: "PRINTER_UNREACHABLE" });
    await stop?.();

    const slow = await start({}, async () => {
      throw new Error("PRINTER_TIMEOUT");
    });
    assert.equal((await print(slow.url, JOB)).status, 504);
  });

  it("allows the POS page to call it across origins, including Chrome's private network preflight", async () => {
    const { url } = await start();

    const preflight = await fetch(`${url}/print`, {
      method: "OPTIONS",
      headers: { Origin: POS, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type", "Access-Control-Request-Private-Network": "true" },
    });

    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), POS);
    assert.equal(preflight.headers.get("access-control-allow-private-network"), "true");
    assert.match(preflight.headers.get("access-control-allow-headers") ?? "", /authorization/i);
    assert.equal((await print(url, JOB)).headers.get("access-control-allow-origin"), POS);
  });

  it("only serves the configured POS origins when they are set", async () => {
    const { url, jobs } = await start({ allowedOrigins: [POS] });

    const response = await print(url, JOB, { Origin: "https://evil.example" });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "ORIGIN_NOT_ALLOWED" });
    assert.deepEqual(jobs, []);
    assert.equal((await print(url, JOB)).status, 200);
  });

  it("prints jobs for the same printer one after another, never interleaved", async () => {
    const log: string[] = [];
    const { url } = await start({}, async (_address, data) => {
      log.push(`start ${data[0]}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
      log.push(`end ${data[0]}`);
    });

    await Promise.all([1, 2].map((n) => print(url, { ...JOB, data: Buffer.from([n]).toString("base64") })));

    assert.deepEqual(log, ["start 1", "end 1", "start 2", "end 2"]);
  });

  it("refuses a body larger than 1 MB", async () => {
    const { url } = await start();

    const response = await print(url, { ...JOB, data: "A".repeat(1_100_000) });

    assert.equal(response.status, 413);
  });

  it("answers 404 for anything else", async () => {
    const { url } = await start();

    assert.equal((await fetch(`${url}/admin`)).status, 404);
  });

  it("pairs a POS with the 6-digit code from the local page and hands it the token (P1-5)", async () => {
    const pairing = new Pairing({ randomCode: () => 123456 });
    const { url } = await start({ pairing });

    const wrong = await fetch(`${url}/pair`, { method: "POST", headers: { "Content-Type": "application/json", Origin: POS }, body: JSON.stringify({ code: "000000" }) });
    const right = await fetch(`${url}/pair`, { method: "POST", headers: { "Content-Type": "application/json", Origin: POS }, body: JSON.stringify({ code: "123456" }) });

    assert.equal(wrong.status, 401);
    assert.deepEqual([right.status, await right.json()], [200, { token: "s3cret" }]);
  });

  it("shows the pairing code, the printers and the last errors on the local page, never receipt data", async () => {
    const { url } = await start({ pairing: new Pairing({ randomCode: () => 654321 }), printers: ["192.168.1.50:9100"] }, async () => {
      throw new Error("PRINTER_TIMEOUT");
    });
    await print(url, JOB);

    const page = await (await fetch(`${url}/`)).text();

    assert.match(page, /654321/);
    assert.match(page, /192\.168\.1\.50:9100/);
    assert.match(page, /PRINTER_TIMEOUT/);
    assert.doesNotMatch(page, new RegExp(JOB.data.replace(/[+/=]/g, "\\$&")));
  });

  it("prints a test page from the local page", async () => {
    const { url, jobs } = await start({ printers: ["192.168.1.50:9100"] });

    const response = await fetch(`${url}/test-print`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ printer: "192.168.1.50:9100" }) });

    assert.equal(response.status, 200);
    assert.match(jobs[0]!.data.toString("latin1"), /POSLite Print Bridge/);
  });

  it("serves the local page and the test print to this PC only", async () => {
    const { url } = await start({ isLocal: () => false });

    assert.equal((await fetch(`${url}/`)).status, 403);
    assert.equal((await fetch(`${url}/test-print`, { method: "POST", body: "{}" })).status, 403);
  });
});
