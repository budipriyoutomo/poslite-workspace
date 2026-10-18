import { httpBase } from "./http-address";
import type { PrinterDriver } from "./printer-driver";

const EPOS_NS = "http://www.epson-pos.com/schemas/2011/03/epos-print";

const hex = (data: Uint8Array) => Array.from(data, (b) => b.toString(16).padStart(2, "0")).join("");

const envelope = (data: Uint8Array) =>
  `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><epos-print xmlns="${EPOS_NS}"><command>${hex(data)}</command></epos-print></s:Body></s:Envelope>`;

/**
 * Epson ePOS-Print over HTTP(S) straight from the browser (TM-m30, TM-T88VI…, LAN/Wi-Fi). The
 * receipt's ESC/POS bytes travel as one hex `<command>`. An HTTPS POS page can only reach the
 * printer over HTTPS: open https://<printer>/ once on the device and accept its certificate.
 */
export function createEpsonEposDriver(fetchFn: typeof fetch = (...args) => fetch(...args)): PrinterDriver {
  let address: string | null = null;

  return {
    type: "epson-epos",
    connection: "address",
    isSupported: () => true,
    pair: async () => {
      throw new Error("PRINTER_NOT_PAIRABLE");
    },
    async connect(device) {
      if (!device.address) throw new Error("PRINTER_NOT_PAIRED");
      address = device.address;
    },
    async send(data) {
      if (!address) throw new Error("PRINTER_NOT_CONNECTED");
      let response: Response;
      try {
        response = await fetchFn(`${httpBase(address)}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000`, {
          method: "POST",
          headers: { "Content-Type": "text/xml; charset=utf-8", "If-Modified-Since": "Thu, 01 Jan 1970 00:00:00 GMT", SOAPAction: '""' },
          body: envelope(data),
        });
      } catch {
        throw new Error("PRINTER_UNREACHABLE");
      }
      if (!response.ok) throw new Error("PRINTER_UNREACHABLE");
      const result = await response.text();
      if (!/success="true"/.test(result)) throw new Error(`PRINTER_REFUSED: ${/code="([^"]*)"/.exec(result)?.[1] || "unknown"}`);
    },
    async disconnect() {
      address = null;
    },
  };
}
