import { httpBase } from "./http-address";
import type { PairedDevice, PrinterDriver } from "./printer-driver";

const base64 = (data: Uint8Array) => btoa(Array.from(data, (b) => String.fromCharCode(b)).join(""));

/**
 * Print Bridge driver (04-printing.md): browsers cannot open raw TCP, so a small app on the LAN
 * (`poslite-print-bridge`) forwards `POST /print` to the printer's port 9100. From an HTTPS POS page
 * the bridge must be `http://localhost` (same PC) or HTTPS with a certificate the device trusts.
 */
export function createBridgeDriver(fetchFn: typeof fetch = (...args) => fetch(...args)): PrinterDriver {
  let target: Required<Pick<PairedDevice, "bridgeUrl" | "bridgeToken" | "address">> | null = null;

  return {
    type: "bridge",
    connection: "address",
    isSupported: () => true,
    pair: async () => {
      throw new Error("PRINTER_NOT_PAIRABLE");
    },
    async connect({ bridgeUrl, bridgeToken, address }) {
      if (!bridgeUrl || !bridgeToken || !address) throw new Error("PRINTER_NOT_PAIRED");
      target = { bridgeUrl, bridgeToken, address };
    },
    async send(data) {
      if (!target) throw new Error("PRINTER_NOT_CONNECTED");
      let response: Response;
      try {
        response = await fetchFn(`${httpBase(target.bridgeUrl)}/print`, {
          method: "POST",
          headers: { Authorization: `Bearer ${target.bridgeToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ printer: target.address, data: base64(data) }),
        });
      } catch {
        throw new Error("BRIDGE_UNREACHABLE");
      }
      if (response.ok) return;
      if (response.status === 401) throw new Error("BRIDGE_UNAUTHORIZED");
      const body: unknown = await response.json().catch(() => null);
      const code = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : `HTTP ${response.status}`;
      throw new Error(code);
    },
    async disconnect() {
      target = null;
    },
  };
}
