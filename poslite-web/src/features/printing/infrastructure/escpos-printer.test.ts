import { describe, expect, it } from "vitest";

import { createEscPosPrinter } from "./escpos-printer";
import type { PairedDevice, PrinterDriver } from "./printer-driver";

const DEVICE: PairedDevice = { bluetoothServiceClassId: "00001101-0000-1000-8000-00805f9b34fb" };
const BYTES = new Uint8Array([0x1b, 0x40, 0x41]);

/** Fails the first `failures` sends, like a printer that was switched off and on again. */
function fakeDriver(failures = 0) {
  const log: string[] = [];
  const sent: Uint8Array[] = [];
  let remaining = failures;
  const driver: PrinterDriver = {
    type: "web-serial",
    connection: "picker",
    isSupported: () => true,
    pair: async () => DEVICE,
    connect: async () => void log.push("connect"),
    disconnect: async () => void log.push("disconnect"),
    send: async (data) => {
      log.push("send");
      if (remaining-- > 0) throw new Error("NetworkError: The device has been lost.");
      sent.push(data);
    },
  };
  return { driver, log, sent };
}

const render = async () => BYTES;

describe("ESC/POS printer", () => {
  it("connects to the saved printer and sends the rendered receipt", async () => {
    const { driver, log, sent } = fakeDriver();

    await createEscPosPrinter(driver, DEVICE, render).print([{ kind: "rule" }], 32);

    expect(log).toEqual(["connect", "send"]);
    expect(sent).toEqual([BYTES]);
  });

  it("reconnects and resends once when the printer was restarted", async () => {
    const { driver, log, sent } = fakeDriver(1);

    await createEscPosPrinter(driver, DEVICE, render).print([{ kind: "rule" }], 32);

    expect(log).toEqual(["connect", "send", "disconnect", "connect", "send"]);
    expect(sent).toEqual([BYTES]);
  });

  it("gives up after the retry fails too", async () => {
    const { driver } = fakeDriver(2);

    await expect(createEscPosPrinter(driver, DEVICE, render).print([{ kind: "rule" }], 32)).rejects.toThrow("device has been lost");
  });
});
