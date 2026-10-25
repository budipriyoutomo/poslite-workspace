import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadConfig } from "./config.ts";

const TOKEN = "0123456789abcdef0123";

describe("loadConfig", () => {
  it("listens on localhost:9180 by default, over plain HTTP", () => {
    assert.deepEqual(loadConfig({ BRIDGE_TOKEN: TOKEN }), { host: "127.0.0.1", port: 9180, token: TOKEN, allowedOrigins: [], printers: [], tls: null });
  });

  it("reads the listen address, origins, printer allowlist and TLS files", () => {
    const config = loadConfig({
      BRIDGE_TOKEN: TOKEN,
      BRIDGE_HOST: "0.0.0.0",
      BRIDGE_PORT: "9443",
      BRIDGE_ALLOWED_ORIGINS: "https://pos.poslite.id, https://staging.poslite.id",
      BRIDGE_PRINTERS: "192.168.1.50:9100,kitchen.local",
      BRIDGE_TLS_CERT: "/etc/bridge/cert.pem",
      BRIDGE_TLS_KEY: "/etc/bridge/key.pem",
    });

    assert.deepEqual(config, {
      host: "0.0.0.0",
      port: 9443,
      token: TOKEN,
      allowedOrigins: ["https://pos.poslite.id", "https://staging.poslite.id"],
      printers: ["192.168.1.50:9100", "kitchen.local"],
      tls: { certFile: "/etc/bridge/cert.pem", keyFile: "/etc/bridge/key.pem" },
    });
  });

  it("leaves the token to the bridge when none is set: it makes one and the POS pairs with a code (P1-5)", () => {
    assert.equal(loadConfig({}).token, "");
  });

  it("refuses a token that is too short", () => {
    assert.throws(() => loadConfig({ BRIDGE_TOKEN: "short" }), /BRIDGE_TOKEN/);
  });

  it("refuses a TLS certificate without its key", () => {
    assert.throws(() => loadConfig({ BRIDGE_TOKEN: TOKEN, BRIDGE_TLS_CERT: "/etc/bridge/cert.pem" }), /BRIDGE_TLS_KEY/);
  });

  it("refuses an invalid port", () => {
    assert.throws(() => loadConfig({ BRIDGE_TOKEN: TOKEN, BRIDGE_PORT: "http" }), /BRIDGE_PORT/);
  });
});
