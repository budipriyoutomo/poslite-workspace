import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import type { PosDb } from "@/shared/db";

import { createTestDb } from "../../../../tests/support/test-db";
import type { PrinterDriver } from "../application/configured-printer";
import type { PrinterSetupDeps } from "../application/printer-setup";
import { PrinterRoleSettings, PrinterSettings } from "./PrinterSettings";

const DEVICE = { usbVendorId: 0x0416, usbProductId: 0x5011 };

let db: PosDb;
let sent: Uint8Array[];
let systemPrints: number;
let connectedTo: object[];

function setup({ isSupported = true, isPrinterOn = true, isPickerCancelled = false, role = "receipt" as "receipt" | "kitchen" | "bar", isWholeScreen = false } = {}) {
  const serial: PrinterDriver = {
    type: "web-serial",
    connection: "picker",
    isSupported: () => isSupported,
    pair: async () => {
      if (isPickerCancelled) throw new DOMException("No port selected by the user.", "NotFoundError");
      return DEVICE;
    },
    connect: async () => undefined,
    disconnect: async () => undefined,
    send: async (data) => {
      if (!isPrinterOn) throw new Error("NetworkError: The device has been lost.");
      sent.push(data);
    },
  };
  const lan = (type: "epson-epos" | "bridge"): PrinterDriver => ({
    type,
    connection: "address",
    isSupported: () => true,
    pair: async () => {
      throw new Error("PRINTER_NOT_PAIRABLE");
    },
    connect: async (device) => void connectedTo.push(device),
    disconnect: async () => undefined,
    send: async (data) => void sent.push(data),
  });
  let n = 0;
  const deps: PrinterSetupDeps = {
    db,
    printers: { system: { print: async () => void systemPrints++ }, drivers: { "web-serial": serial, "epson-epos": lan("epson-epos"), bridge: lan("bridge") } },
    newId: () => `01J8Z0000000000000000PRN${++n}`,
    now: () => new Date("2026-10-18T03:15:00.000Z"),
  };
  render(isWholeScreen ? <PrinterSettings deps={deps} /> : <PrinterRoleSettings role={role} deps={deps} />);
}

beforeEach(() => {
  db = createTestDb();
  sent = [];
  systemPrints = 0;
  connectedTo = [];
});

describe("PrinterSettings", () => {
  it("uses the system print dialog until another connection is chosen", async () => {
    setup();

    expect(await screen.findByRole("radio", { name: "Dialog cetak sistem" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Test print" }));

    await waitFor(() => expect(systemPrints).toBe(1));
  });

  it("explains why Bluetooth/USB is missing in a browser without Web Serial", async () => {
    setup({ isSupported: false });

    expect(await screen.findByText(/tidak mendukung printer Bluetooth\/USB/)).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Bluetooth / USB (Web Serial)" })).not.toBeInTheDocument();
  });

  it("pairs a Bluetooth/USB printer and prints the test page on it", async () => {
    setup();

    await userEvent.click(await screen.findByRole("radio", { name: "Bluetooth / USB (Web Serial)" }));
    await userEvent.click(await screen.findByRole("button", { name: "Hubungkan printer" }));
    expect(await screen.findByText("Printer terhubung")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Test print" }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(await screen.findByRole("status")).toHaveTextContent("Test print terkirim");
  });

  it("asks to connect before printing when no printer was paired", async () => {
    setup();

    await userEvent.click(await screen.findByRole("radio", { name: "Bluetooth / USB (Web Serial)" }));
    await userEvent.click(await screen.findByRole("button", { name: "Test print" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Printer belum dihubungkan");
  });

  it("says the printer is off when sending fails", async () => {
    setup({ isPrinterOn: false });

    await userEvent.click(await screen.findByRole("radio", { name: "Bluetooth / USB (Web Serial)" }));
    await userEvent.click(await screen.findByRole("button", { name: "Hubungkan printer" }));
    await screen.findByText("Printer terhubung");
    await userEvent.click(screen.getByRole("button", { name: "Test print" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Printer tidak merespons");
  });

  it("stays quiet when the cashier closes the device picker", async () => {
    setup({ isPickerCancelled: true });

    await userEvent.click(await screen.findByRole("radio", { name: "Bluetooth / USB (Web Serial)" }));
    await userEvent.click(await screen.findByRole("button", { name: "Hubungkan printer" }));

    expect(await screen.findByText("Belum ada printer")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("saves the paper width", async () => {
    setup();

    await userEvent.click(await screen.findByRole("radio", { name: "80 mm" }));

    await waitFor(async () => expect((await db.printers.toArray())[0]?.paperWidth).toBe(80));
  });
});

describe("PrinterSettings — kitchen and bar", () => {
  it("shows a section for the receipt, kitchen and bar printers", async () => {
    setup({ isWholeScreen: true });

    expect(await screen.findByRole("heading", { name: "Printer Struk" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Printer Dapur" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Printer Bar" })).toBeInTheDocument();
  });

  it("prints no kitchen tickets until a printer is chosen", async () => {
    setup({ role: "kitchen" });

    expect(await screen.findByRole("radio", { name: "Tidak dicetak" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Test print" })).toBeDisabled();
  });

  it("can share the receipt printer, with nothing to pair or size", async () => {
    setup({ role: "kitchen" });

    await userEvent.click(await screen.findByRole("radio", { name: "Pakai printer struk" }));

    await waitFor(async () => expect(await db.printers.toArray()).toMatchObject([{ role: "kitchen", driver: "same-as-receipt" }]));
    expect(screen.queryByRole("button", { name: "Hubungkan printer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "80 mm" })).not.toBeInTheDocument();
  });

  it("goes back to no tickets when set to not printed", async () => {
    setup({ role: "bar" });

    await userEvent.click(await screen.findByRole("radio", { name: "Dialog cetak sistem" }));
    await waitFor(async () => expect(await db.printers.count()).toBe(1));
    await userEvent.click(screen.getByRole("radio", { name: "Tidak dicetak" }));

    await waitFor(async () => expect(await db.printers.count()).toBe(0));
  });
});

describe("PrinterSettings — LAN printers", () => {
  it("takes an Epson printer's address and prints the test page to it", async () => {
    setup();

    await userEvent.click(await screen.findByRole("radio", { name: "Printer LAN Epson (ePOS)" }));
    await userEvent.type(await screen.findByLabelText("Alamat printer"), "192.168.1.50");
    await userEvent.click(screen.getByRole("button", { name: "Simpan alamat" }));
    await waitFor(async () => expect((await db.printers.toArray())[0]?.device).toEqual({ address: "192.168.1.50" }));
    await userEvent.click(screen.getByRole("button", { name: "Test print" }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(connectedTo).toEqual([{ address: "192.168.1.50" }]);
    expect(screen.queryByRole("button", { name: "Hubungkan printer" })).not.toBeInTheDocument();
  });

  it("takes the bridge URL, token and printer address for a Print Bridge printer", async () => {
    setup({ role: "kitchen" });

    await userEvent.click(await screen.findByRole("radio", { name: "Printer LAN lewat Print Bridge" }));
    await userEvent.type(await screen.findByLabelText("Alamat Print Bridge"), "http://localhost:9180");
    await userEvent.type(screen.getByLabelText("Token Print Bridge"), "s3cret");
    await userEvent.type(screen.getByLabelText("Alamat printer"), "192.168.1.60:9100");
    await userEvent.click(screen.getByRole("button", { name: "Simpan alamat" }));

    await waitFor(async () =>
      expect((await db.printers.toArray())[0]?.device).toEqual({ bridgeUrl: "http://localhost:9180", bridgeToken: "s3cret", address: "192.168.1.60:9100" }),
    );
  });

  it("asks for the address when it is left empty", async () => {
    setup();

    await userEvent.click(await screen.findByRole("radio", { name: "Printer LAN Epson (ePOS)" }));
    await userEvent.click(await screen.findByRole("button", { name: "Simpan alamat" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Isi alamat printer");
  });
});
