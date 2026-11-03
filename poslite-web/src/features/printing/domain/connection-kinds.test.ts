import { describe, expect, it } from "vitest";

import { connectionKinds, kindOf } from "./connection-kinds";

const all = new Set(["web-serial", "web-bluetooth", "web-usb", "epson-epos", "bridge"] as const);

describe("connectionKinds (15 · UX-08)", () => {
  it("offers Wi-Fi/LAN, Bluetooth and USB in operational words, mapped to the drivers", () => {
    expect(connectionKinds("receipt", all)).toEqual([
      { kind: "lan", driver: "bridge" },
      { kind: "bluetooth", driver: "web-serial" },
      { kind: "usb", driver: "web-usb" },
    ]);
  });

  it("lets a kitchen or bar station share the receipt printer or print nothing", () => {
    expect(connectionKinds("kitchen", all).map((k) => k.kind)).toEqual(["lan", "bluetooth", "usb", "same-as-receipt", "none"]);
  });

  it("uses Bluetooth LE where Web Serial is missing, and USB through Web Serial where WebUSB is", () => {
    expect(connectionKinds("receipt", new Set(["web-bluetooth", "bridge"]))).toContainEqual({ kind: "bluetooth", driver: "web-bluetooth" });
    expect(connectionKinds("receipt", new Set(["web-serial", "bridge"]))).toContainEqual({ kind: "usb", driver: "web-serial" });
  });

  it("marks Bluetooth and USB unavailable on a browser without them, such as an iPad", () => {
    expect(connectionKinds("receipt", new Set(["bridge", "epson-epos"]))).toEqual([
      { kind: "lan", driver: "bridge" },
      { kind: "bluetooth", driver: null },
      { kind: "usb", driver: null },
    ]);
  });

  it("names a saved driver by its kind", () => {
    expect([kindOf("bridge"), kindOf("web-serial"), kindOf("web-usb"), kindOf("epson-epos"), kindOf("system")]).toEqual(["lan", "bluetooth", "usb", "lan", "system"]);
  });
});
