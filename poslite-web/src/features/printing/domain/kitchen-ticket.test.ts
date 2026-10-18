import { describe, expect, it } from "vitest";

import { buildKitchenTicket, type KitchenTicketInput } from "./kitchen-ticket";
import { renderText } from "./text-layout";

const ticket: KitchenTicketInput = {
  station: "kitchen",
  tableLabel: "A1",
  reference: "JKT01A-260925-0042",
  cashierName: "Siti",
  at: "2026-09-25T04:03:00.000Z", // 11:03 WIB
  timezone: "Asia/Jakarta",
  isAddition: false,
  lines: [
    { name: "Nasi Gudeg", quantity: 2, modifiers: ["Tambah Ayam"], note: "tidak pedas" },
    { name: "Soto Ayam", quantity: 1, modifiers: [], note: "" },
  ],
};

describe("kitchen ticket (58 mm)", () => {
  it("lists what to make for the table, without prices", () => {
    expect(renderText(buildKitchenTicket(ticket), 32)).toEqual([
      "          ** DAPUR **",
      "Meja  : A1",
      "No    : JKT01A-260925-0042",
      "Kasir : Siti      25/09/26 11:03",
      "--------------------------------",
      "2x Nasi Gudeg",
      "   + Tambah Ayam",
      "   * tidak pedas",
      "1x Soto Ayam",
      "--------------------------------",
    ]);
  });

  it("is headed BAR for the bar printer", () => {
    expect(renderText(buildKitchenTicket({ ...ticket, station: "bar" }), 32)[0]).toBe("           ** BAR **");
  });

  it("says take-away when there is no table", () => {
    expect(renderText(buildKitchenTicket({ ...ticket, tableLabel: null }), 32)).toContain("Meja  : BAWA PULANG");
  });

  it("marks items added to a bill that was already sent", () => {
    expect(renderText(buildKitchenTicket({ ...ticket, isAddition: true }), 32)).toContain("          + TAMBAHAN +");
  });

  it("prints item lines bold so the cook reads them at a glance", () => {
    expect(buildKitchenTicket(ticket).filter((b) => b.kind === "text" && b.bold).map((b) => b.kind === "text" && b.text)).toEqual(["** DAPUR **", "2x Nasi Gudeg", "1x Soto Ayam"]);
  });
});
