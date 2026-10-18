import { describe, expect, it } from "vitest";

import { createEpsonEposDriver } from "./epson-epos-driver";

const OK = '<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><response success="true" code="" status="251658262" battery="0" xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print"/></s:Body></s:Envelope>';
const FAIL = (code: string) => `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><response success="false" code="${code}" status="0"/></s:Body></s:Envelope>`;

function fakeFetch(respond: () => Response | Promise<Response> = () => new Response(OK, { status: 200 })) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return respond();
  };
  return { fetchFn: fetchFn as typeof fetch, calls };
}

describe("Epson ePOS driver (LAN, HTTP straight to the printer)", () => {
  it("is found by its address, not a device picker", async () => {
    const driver = createEpsonEposDriver(fakeFetch().fetchFn);

    expect(driver.connection).toBe("address");
    await expect(driver.pair()).rejects.toThrow("PRINTER_NOT_PAIRABLE");
  });

  it("sends the ESC/POS bytes as a hex command to the printer's ePOS service over HTTPS", async () => {
    const { fetchFn, calls } = fakeFetch();
    const driver = createEpsonEposDriver(fetchFn);

    await driver.connect({ address: "192.168.1.50" });
    await driver.send(new Uint8Array([0x1b, 0x40, 0x41, 0x0a]));

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://192.168.1.50/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000");
    expect(calls[0]!.init.method).toBe("POST");
    expect(new Headers(calls[0]!.init.headers).get("Content-Type")).toBe("text/xml; charset=utf-8");
    expect(String(calls[0]!.init.body)).toContain('<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print"><command>1b40410a</command></epos-print>');
  });

  it("keeps an explicit http:// address (local network without TLS)", async () => {
    const { fetchFn, calls } = fakeFetch();
    const driver = createEpsonEposDriver(fetchFn);

    await driver.connect({ address: "http://192.168.1.50:8008" });
    await driver.send(new Uint8Array([1]));

    expect(calls[0]!.url).toBe("http://192.168.1.50:8008/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000");
  });

  it("reports the printer's error code when it refuses the job", async () => {
    const driver = createEpsonEposDriver(fakeFetch(() => new Response(FAIL("EPTR_COVER_OPEN"), { status: 200 })).fetchFn);

    await driver.connect({ address: "192.168.1.50" });

    await expect(driver.send(new Uint8Array([1]))).rejects.toThrow("EPTR_COVER_OPEN");
  });

  it("reports an unreachable printer", async () => {
    const driver = createEpsonEposDriver(fakeFetch(() => Promise.reject(new TypeError("Failed to fetch"))).fetchFn);

    await driver.connect({ address: "192.168.1.50" });

    await expect(driver.send(new Uint8Array([1]))).rejects.toThrow("PRINTER_UNREACHABLE");
  });

  it("reports an HTTP error from the printer", async () => {
    const driver = createEpsonEposDriver(fakeFetch(() => new Response("", { status: 500 })).fetchFn);

    await driver.connect({ address: "192.168.1.50" });

    await expect(driver.send(new Uint8Array([1]))).rejects.toThrow("PRINTER_UNREACHABLE");
  });

  it("needs an address before connecting and a connection before sending", async () => {
    const driver = createEpsonEposDriver(fakeFetch().fetchFn);

    await expect(driver.connect({})).rejects.toThrow("PRINTER_NOT_PAIRED");
    await expect(driver.send(new Uint8Array([1]))).rejects.toThrow("PRINTER_NOT_CONNECTED");
  });
});
