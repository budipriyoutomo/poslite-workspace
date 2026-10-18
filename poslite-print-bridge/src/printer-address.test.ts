import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isAllowed, parsePrinterAddress } from "./printer-address.ts";

describe("parsePrinterAddress", () => {
  it("defaults to the raw printing port 9100", () => {
    assert.deepEqual(parsePrinterAddress("192.168.1.50"), { host: "192.168.1.50", port: 9100 });
  });

  it("keeps an explicit port", () => {
    assert.deepEqual(parsePrinterAddress("192.168.1.50:9101"), { host: "192.168.1.50", port: 9101 });
  });

  it("rejects anything that is not host[:port]", () => {
    for (const bad of ["", "http://192.168.1.50", "192.168.1.50:0", "192.168.1.50:70000", "192.168.1.50:abc", "a b"]) {
      assert.equal(parsePrinterAddress(bad), null, bad);
    }
  });
});

describe("isAllowed", () => {
  it("allows private network printers when no allowlist is configured", () => {
    for (const host of ["10.0.0.5", "172.16.3.4", "172.31.255.1", "192.168.1.50", "127.0.0.1"]) {
      assert.equal(isAllowed({ host, port: 9100 }, []), true, host);
    }
  });

  it("refuses public addresses and host names by default, so the bridge is not an open relay", () => {
    for (const host of ["8.8.8.8", "172.32.0.1", "printer.example.com", "kitchen.local"]) {
      assert.equal(isAllowed({ host, port: 9100 }, []), false, host);
    }
  });

  it("allows exactly the configured printers when an allowlist is set", () => {
    const allowlist = ["kitchen.local:9100", "192.168.1.50:9100"];

    assert.equal(isAllowed({ host: "kitchen.local", port: 9100 }, allowlist), true);
    assert.equal(isAllowed({ host: "192.168.1.50", port: 9100 }, allowlist), true);
    assert.equal(isAllowed({ host: "192.168.1.51", port: 9100 }, allowlist), false);
  });
});
