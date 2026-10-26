import { describe, expect, it } from "vitest";

import { groupPaymentMethods } from "./payment-groups";

type Method = Parameters<typeof groupPaymentMethods>[0][number] & { id: string };
const m = (id: string, type: Method["type"], sortOrder: number): Method => ({ id, type, sortOrder });

describe("groupPaymentMethods (15 · UX-03)", () => {
  it("folds the methods into Tunai, QRIS, Kartu and Lainnya, in that order", () => {
    const groups = groupPaymentMethods([m("GoFood", "voucher", 9), m("Visa", "credit_card", 7), m("Tunai", "cash", 1), m("BCA", "debit", 3), m("QRIS", "qris", 2), m("Transfer", "other", 10)]);

    expect(groups.map((g) => [g.key, g.methods.map((x) => x.id)])).toEqual([
      ["cash", ["Tunai"]],
      ["qris", ["QRIS"]],
      ["card", ["BCA", "Visa"]],
      ["other", ["GoFood", "Transfer"]],
    ]);
  });

  it("leaves out a group the outlet has no method for", () => {
    expect(groupPaymentMethods([m("Tunai", "cash", 1), m("BCA", "debit", 2)]).map((g) => g.key)).toEqual(["cash", "card"]);
  });

  it("keeps the master data order inside a group", () => {
    const [card] = groupPaymentMethods([m("Mandiri", "debit", 4), m("BCA", "debit", 3)]);
    expect(card!.methods.map((x) => x.id)).toEqual(["BCA", "Mandiri"]);
  });
});
