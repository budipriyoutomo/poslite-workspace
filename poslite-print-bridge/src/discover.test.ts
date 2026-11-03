import assert from "node:assert/strict";
import type { NetworkInterfaceInfo } from "node:os";
import { describe, it } from "node:test";

import { discoverPrinters } from "./discover.ts";

const nic = (address: string, netmask: string, extra: Partial<NetworkInterfaceInfo> = {}): NetworkInterfaceInfo =>
  ({ address, netmask, family: "IPv4", mac: "00:00:00:00:00:00", internal: false, cidr: null, ...extra }) as NetworkInterfaceInfo;

/** A fake LAN: only the hosts listed answer on 9100; every probe is recorded. */
function lan(answering: string[]) {
  const probed: string[] = [];
  const probe = async (host: string, port: number) => {
    probed.push(host);
    return port === 9100 && answering.includes(host);
  };
  return { probe, probed };
}

describe("discoverPrinters (15 · UX-08)", () => {
  it("finds the hosts answering on port 9100 in the bridge's subnet", async () => {
    const { probe } = lan(["192.168.1.50", "192.168.1.7"]);

    const found = await discoverPrinters({ interfaces: { en0: [nic("192.168.1.10", "255.255.255.0")] }, probe });

    assert.deepEqual(found, [
      { host: "192.168.1.7", port: 9100 },
      { host: "192.168.1.50", port: 9100 },
    ]);
  });

  it("never probes outside the interface's /24, nor the bridge itself", async () => {
    const { probe, probed } = lan([]);

    await discoverPrinters({ interfaces: { en0: [nic("10.0.5.20", "255.255.0.0")] }, probe });

    assert.equal(probed.length, 253);
    assert.ok(probed.every((h) => h.startsWith("10.0.5.")));
    assert.ok(!probed.includes("10.0.5.20"));
  });

  it("skips loopback, IPv6 and public interfaces", async () => {
    const { probe, probed } = lan([]);

    await discoverPrinters({
      interfaces: { lo: [nic("127.0.0.1", "255.0.0.0", { internal: true })], v6: [nic("fe80::1", "ffff::", { family: "IPv6" })], wan: [nic("203.0.113.5", "255.255.255.0")] },
      probe,
    });

    assert.deepEqual(probed, []);
  });

  it("returns what it found when the time runs out", async () => {
    const probe = (host: string) => (host === "192.168.1.2" ? Promise.resolve(true) : new Promise<boolean>(() => undefined));

    const found = await discoverPrinters({ interfaces: { en0: [nic("192.168.1.10", "255.255.255.0")] }, probe, deadlineMs: 50 });

    assert.deepEqual(found, [{ host: "192.168.1.2", port: 9100 }]);
  });
});
