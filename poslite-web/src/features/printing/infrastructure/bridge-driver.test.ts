import { describe, expect, it } from "vitest";

import { createBridgeDriver } from "./bridge-driver";

const DEVICE = { bridgeUrl: "https://kasir-pc.local:9443", bridgeToken: "s3cret", address: "192.168.1.50:9100" };

function fakeFetch(respond: () => Response | Promise<Response> = () => Response.json({ ok: true })) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return respond();
  };
  return { fetchFn: fetchFn as typeof fetch, calls };
}

describe("Print Bridge driver (raw TCP 9100 printers on the LAN)", () => {
  it("is set up with addresses, not a device picker", async () => {
    const driver = createBridgeDriver(fakeFetch().fetchFn);

    expect(driver.connection).toBe("address");
    await expect(driver.pair()).rejects.toThrow("PRINTER_NOT_PAIRABLE");
  });

  it("posts the bytes as base64 to the bridge with the outlet's token", async () => {
    const { fetchFn, calls } = fakeFetch();
    const driver = createBridgeDriver(fetchFn);

    await driver.connect(DEVICE);
    await driver.send(new Uint8Array([0x1b, 0x40, 0x41]));

    expect(calls[0]!.url).toBe("https://kasir-pc.local:9443/print");
    expect(calls[0]!.init.method).toBe("POST");
    const headers = new Headers(calls[0]!.init.headers);
    expect(headers.get("Authorization")).toBe("Bearer s3cret");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ printer: "192.168.1.50:9100", data: "G0BB" });
  });

  it("passes on the bridge's reason when the printer cannot be reached", async () => {
    const driver = createBridgeDriver(fakeFetch(() => Response.json({ error: "PRINTER_UNREACHABLE" }, { status: 502 })).fetchFn);

    await driver.connect(DEVICE);

    await expect(driver.send(new Uint8Array([1]))).rejects.toThrow("PRINTER_UNREACHABLE");
  });

  it("says the token is wrong when the bridge refuses it", async () => {
    const driver = createBridgeDriver(fakeFetch(() => Response.json({ error: "UNAUTHORIZED" }, { status: 401 })).fetchFn);

    await driver.connect(DEVICE);

    await expect(driver.send(new Uint8Array([1]))).rejects.toThrow("BRIDGE_UNAUTHORIZED");
  });

  it("says the bridge itself is down when it does not answer", async () => {
    const driver = createBridgeDriver(fakeFetch(() => Promise.reject(new TypeError("Failed to fetch"))).fetchFn);

    await driver.connect(DEVICE);

    await expect(driver.send(new Uint8Array([1]))).rejects.toThrow("BRIDGE_UNREACHABLE");
  });

  it("needs the bridge URL, token and printer address", async () => {
    const driver = createBridgeDriver(fakeFetch().fetchFn);

    await expect(driver.connect({ address: "192.168.1.50" })).rejects.toThrow("PRINTER_NOT_PAIRED");
    await expect(driver.send(new Uint8Array([1]))).rejects.toThrow("PRINTER_NOT_CONNECTED");
  });
});
