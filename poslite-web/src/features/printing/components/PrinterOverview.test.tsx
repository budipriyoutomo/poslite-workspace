import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/features/auth";
import type { PosDb, UserRole } from "@/shared/db";

import { createTestDb } from "../../../../tests/support/test-db";
import type { PrinterDriver } from "../application/configured-printer";
import type { PrinterSetupDeps } from "../application/printer-setup";
import { PrinterSettings } from "./PrinterSettings";

let db: PosDb;
let sent: { driver: string; device: object }[];

function driver(type: PrinterDriver["type"]): PrinterDriver {
  let device: object = {};
  return {
    type,
    connection: type === "bridge" || type === "epson-epos" ? "address" : "picker",
    isSupported: () => true,
    pair: async () => ({ usbVendorId: 1, usbProductId: 2 }),
    connect: async (d) => void (device = d),
    disconnect: async () => undefined,
    send: async () => void sent.push({ driver: type, device }),
  };
}

function setup({ role = "manager" as UserRole, drivers = ["web-serial", "web-usb", "bridge"] as PrinterDriver["type"][], discovered = ["192.168.1.60:9100"] as string[] | null, onRetry = vi.fn() } = {}) {
  useSession.setState({ user: { id: "U1", name: "Rina", role } });
  let n = 0;
  const deps: PrinterSetupDeps = {
    db,
    printers: { system: { print: async () => undefined }, drivers: Object.fromEntries(drivers.map((d) => [d, driver(d)])) },
    newId: () => `01J8Z0000000000000000PRN${String(++n).padStart(2, "0")}`,
    now: () => new Date(Date.UTC(2026, 10, 3, 10, 0, n)),
    bridge: { pair: async () => "t0ken", discover: async () => discovered },
  };
  render(<PrinterSettings deps={deps} onRetry={onRetry} />);
  return { onRetry };
}

const card = async (title: string) => screen.findByRole("region", { name: title });

beforeEach(() => {
  db = createTestDb();
  sent = [];
});

describe("PrinterSettings (15 · UX-08)", () => {
  it("shows each printer's status: ready, unreachable with the tickets waiting, or not set up", async () => {
    await db.printers.put({ id: "K", role: "kitchen", driver: "bridge", name: "Dapur", paperWidth: 80, device: { bridgeUrl: "http://localhost:9180", bridgeToken: "t", address: "192.168.1.60:9100" } });
    await db.printJobs.bulkAdd([
      { id: "J1", orderId: "B1", role: "kitchen", documentType: "kitchen_ticket", status: "failed", attempts: 1, createdAt: "2026-11-03T10:00:00.000Z" },
      { id: "J2", orderId: "B2", role: "kitchen", documentType: "kitchen_ticket", status: "failed", attempts: 1, createdAt: "2026-11-03T10:01:00.000Z" },
    ]);
    setup();

    expect(within(await card("Printer Struk")).getByRole("status")).toHaveTextContent("Siap");
    expect(within(await card("Printer Dapur")).getByRole("status")).toHaveTextContent("Tidak terjangkau · 2 tiket menunggu");
    expect(within(await card("Printer Bar")).getByRole("status")).toHaveTextContent("Belum diatur");
    expect(within(await card("Printer Dapur")).getByText("Wi-Fi / Kabel LAN")).toBeInTheDocument();
  });

  it("lets a cashier see the status and test print, but not change a printer", async () => {
    setup({ role: "cashier" });

    const receipt = await card("Printer Struk");
    expect(within(receipt).getByRole("button", { name: "Test print" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Ganti/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Pengaturan lanjutan")).not.toBeInTheDocument();
  });

  it("offers to try an unreachable station's tickets again", async () => {
    await db.printers.put({ id: "K", role: "kitchen", driver: "system", name: "Dapur", paperWidth: 80 });
    await db.printJobs.add({ id: "J1", orderId: "B1", role: "kitchen", documentType: "kitchen_ticket", status: "failed", attempts: 1, createdAt: "2026-11-03T10:00:00.000Z" });
    const { onRetry } = setup({ role: "cashier" });

    await userEvent.click(within(await card("Printer Dapur")).getByRole("button", { name: "Coba lagi" }));

    expect(onRetry).toHaveBeenCalledWith("kitchen");
  });

  it("opens a guide for the common problems", async () => {
    setup({ role: "cashier" });

    await userEvent.click(within(await card("Printer Struk")).getByRole("button", { name: "Panduan" }));

    expect(await screen.findByRole("dialog", { name: "Panduan printer" })).toHaveTextContent("Kertas");
  });
});

describe("PrinterWizard (15 · UX-08)", () => {
  const next = () => userEvent.click(screen.getByRole("button", { name: "Lanjut" }));

  it("sets up a Wi-Fi/LAN kitchen printer the bridge found, in four steps", async () => {
    setup();
    await userEvent.click(within(await card("Printer Dapur")).getByRole("button", { name: "Ganti" }));
    const wizard = await screen.findByRole("dialog", { name: "Atur Printer Dapur" });
    expect(wizard).toHaveTextContent("Langkah 2 dari 4");

    await userEvent.click(screen.getByRole("radio", { name: /Wi-Fi \/ Kabel LAN/ }));
    await next();
    expect(await screen.findByLabelText("Alamat Print Bridge")).toHaveValue("http://localhost:9180");
    await userEvent.type(screen.getByLabelText("Kode pairing"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Pasangkan" }));
    await userEvent.click(await screen.findByRole("radio", { name: "192.168.1.60:9100" }));
    await next();
    await userEvent.click(await screen.findByRole("button", { name: "Test print" }));
    await waitFor(() => expect(sent).toEqual([{ driver: "bridge", device: { bridgeUrl: "http://localhost:9180", bridgeToken: "t0ken", address: "192.168.1.60:9100" } }]));
    await userEvent.click(screen.getByRole("button", { name: "Selesai" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect((await db.printers.where("role").equals("kitchen").first())?.driver).toBe("bridge");
  });

  it("asks for the printer's IP when the bridge is too old to look", async () => {
    setup({ discovered: null });
    await userEvent.click(within(await card("Printer Struk")).getByRole("button", { name: "Ganti" }));
    await userEvent.click(await screen.findByRole("radio", { name: /Wi-Fi \/ Kabel LAN/ }));
    await next();
    await userEvent.type(await screen.findByLabelText("Kode pairing"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Pasangkan" }));

    expect(await screen.findByLabelText("Alamat IP printer")).toBeInTheDocument();
  });

  it("pairs a Bluetooth printer through the browser's picker", async () => {
    setup();
    await userEvent.click(within(await card("Printer Struk")).getByRole("button", { name: "Ganti" }));
    await userEvent.click(await screen.findByRole("radio", { name: /Bluetooth/ }));
    await next();
    await userEvent.click(await screen.findByRole("button", { name: "Hubungkan printer" }));

    expect(await screen.findByText("Printer terhubung")).toBeInTheDocument();
    expect((await db.printers.where("role").equals("receipt").first())?.device).toEqual({ usbVendorId: 1, usbProductId: 2 });
  });

  it("says Bluetooth is not available on a browser without it, such as an iPad", async () => {
    setup({ drivers: ["bridge"] });
    await userEvent.click(within(await card("Printer Struk")).getByRole("button", { name: "Ganti" }));

    const bluetooth = await screen.findByRole("radio", { name: /Bluetooth/ });
    expect(bluetooth).toBeDisabled();
    expect(bluetooth).toHaveAccessibleName(/Tidak tersedia di perangkat ini/);
  });

  it("lets a station share the receipt printer, with nothing to pick", async () => {
    setup();
    await userEvent.click(within(await card("Printer Bar")).getByRole("button", { name: "Ganti" }));
    await userEvent.click(await screen.findByRole("radio", { name: /Pakai printer struk/ }));
    await next();

    expect(await screen.findByText(/Langkah 4 dari 4/)).toBeInTheDocument();
    expect((await db.printers.where("role").equals("bar").first())?.driver).toBe("same-as-receipt");
  });
});
