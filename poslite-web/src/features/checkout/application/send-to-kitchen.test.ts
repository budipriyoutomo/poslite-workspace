import { describe, expect, it } from "vitest";

import type { CartLine } from "@/features/cart";
import type { KitchenOrder } from "@/features/printing";

import { sendPaidToKitchen } from "./send-to-kitchen";

const line = (key: string, quantity: number, sentQuantity?: number): CartLine => ({
  key,
  productId: `P-${key}`,
  name: `Menu ${key}`,
  categoryName: "Makanan",
  unitPrice: 10_000,
  modifiers: [],
  note: "",
  quantity,
  ...(sentQuantity !== undefined && { sentQuantity }),
});

const ORDER = { id: "01J8Z0000000000000000ORD01", receiptNo: "JKT01A-260925-0042" };

function fakePrint() {
  const tickets: KitchenOrder[] = [];
  const print = async (order: KitchenOrder) => {
    tickets.push(order);
    return { sentKeys: order.lines.map((l) => l.key), hasFailed: false };
  };
  return { tickets, print };
}

describe("sendPaidToKitchen", () => {
  it("sends a take-away order's items under its receipt number", async () => {
    const { tickets, print } = fakePrint();

    await sendPaidToKitchen({ order: ORDER, lines: [line("a", 2)], tableLabel: null, cashierName: "Siti" }, print);

    expect(tickets).toMatchObject([{ refId: ORDER.id, reference: ORDER.receiptNo, tableLabel: null, isAddition: false, lines: [{ key: "a", quantity: 2 }] }]);
  });

  it("sends only the units of a paid bill the kitchen has not seen", async () => {
    const { tickets, print } = fakePrint();

    await sendPaidToKitchen({ order: ORDER, lines: [line("a", 2, 2), line("b", 3, 1)], tableLabel: "A1", cashierName: "Siti" }, print);

    expect(tickets).toMatchObject([{ tableLabel: "A1", isAddition: true, lines: [{ key: "b", quantity: 2 }] }]);
    expect(tickets[0]!.lines).toHaveLength(1);
  });

  it("prints nothing when the kitchen already has everything", async () => {
    const { tickets, print } = fakePrint();

    expect(await sendPaidToKitchen({ order: ORDER, lines: [line("a", 2, 2)], tableLabel: "A1", cashierName: "Siti" }, print)).toEqual({ hasFailed: false });
    expect(tickets).toEqual([]);
  });

  it("names the delivery app and its order number on the ticket (ADR-029)", async () => {
    const { tickets, print } = fakePrint();

    await sendPaidToKitchen({ order: { ...ORDER, channelName: "GoFood", externalRef: "GF-881234" }, lines: [line("a", 1)], tableLabel: null, cashierName: "Siti" }, print);

    expect(tickets[0]?.channel).toBe("GOFOOD #GF-881234");
  });
});
