import { describe, expect, it } from "vitest";

import { createTestDb } from "../../../../tests/support/test-db";
import { cartStorage } from "../infrastructure/cart-storage";
import { createCartStore } from "./cart-store";

const gudeg = { productId: "P1", name: "Nasi Gudeg", categoryName: "Makanan", unitPrice: 25_000, modifiers: [], note: "" };

describe("cart store", () => {
  it("adds, merges and clears lines and the discount", () => {
    const useCart = createCartStore(cartStorage(() => createTestDb()));
    useCart.getState().add(gudeg);
    useCart.getState().add(gudeg);
    useCart.getState().setDiscount({ type: "percentage", value: 10 });
    expect(useCart.getState().lines).toMatchObject([{ productId: "P1", quantity: 2 }]);
    expect(useCart.getState().discount).toEqual({ type: "percentage", value: 10 });

    useCart.getState().clear();
    expect(useCart.getState()).toMatchObject({ lines: [], discount: null });
  });

  it("restores the cart after a reload from IndexedDB", async () => {
    const db = createTestDb();
    const before = createCartStore(cartStorage(() => db));
    before.getState().add(gudeg);
    await new Promise((r) => setTimeout(r, 20)); // let the async write land

    const after = createCartStore(cartStorage(() => db));
    await after.persist.rehydrate();
    expect(after.getState().lines).toMatchObject([{ productId: "P1", quantity: 1 }]);
  });

  it("works on a dine-in bill and forgets it on clear", () => {
    const useCart = createCartStore(cartStorage(() => createTestDb()));
    const bill = { id: "B1", tableId: "T1", tableLabel: "A1", openedBy: "U1", openedAt: "2026-09-25T02:00:00.000Z" };
    useCart.getState().loadBill(bill, [{ ...gudeg, key: "g", quantity: 2 }], { type: "percentage", value: 10 });

    expect(useCart.getState()).toMatchObject({ bill, lines: [{ key: "g", quantity: 2 }], discount: { type: "percentage", value: 10 } });

    useCart.getState().clear();
    expect(useCart.getState().bill).toBeNull();
  });

  it("toggles the promotions chosen at payment and forgets them on clear", () => {
    const useCart = createCartStore(cartStorage(() => createTestDb()));
    useCart.getState().add(gudeg);
    useCart.getState().togglePromotion("PR1");
    useCart.getState().togglePromotion("PR2");
    useCart.getState().togglePromotion("PR1");
    expect(useCart.getState().promotionIds).toEqual(["PR2"]);

    useCart.getState().clear();
    expect(useCart.getState().promotionIds).toEqual([]);
  });

  it("keeps the chosen promotions after a reload", async () => {
    const db = createTestDb();
    const before = createCartStore(cartStorage(() => db));
    before.getState().togglePromotion("PR1");
    await new Promise((r) => setTimeout(r, 20));

    const after = createCartStore(cartStorage(() => db));
    await after.persist.rehydrate();
    expect(after.getState().promotionIds).toEqual(["PR1"]);
  });

  it("forgets the chosen promotions when the last line is removed", () => {
    const useCart = createCartStore(cartStorage(() => createTestDb()));
    useCart.getState().add(gudeg);
    useCart.getState().togglePromotion("PR1");

    useCart.getState().changeQuantity(useCart.getState().lines[0]!.key, -1);

    expect(useCart.getState().promotionIds).toEqual([]);
  });

  it("opens a bill with no promotion chosen unless they are handed over", () => {
    const useCart = createCartStore(cartStorage(() => createTestDb()));
    const bill = { id: "B1", tableId: "T1", tableLabel: "A1", openedBy: "U1", openedAt: "2026-09-25T02:00:00.000Z" };
    useCart.getState().togglePromotion("PR1");

    useCart.getState().loadBill(bill, [{ ...gudeg, key: "g", quantity: 1 }], null);
    expect(useCart.getState().promotionIds).toEqual([]);

    useCart.getState().loadBill(bill, [{ ...gudeg, key: "g", quantity: 1 }], null, ["PR2"]);
    expect(useCart.getState().promotionIds).toEqual(["PR2"]);
  });

  it("moves the cart to another channel at that channel's prices, and a new sale starts on the default (ADR-029)", () => {
    const useCart = createCartStore(cartStorage(() => createTestDb()));
    useCart.getState().add(gudeg);
    useCart.getState().setExternalRef("GF-1");

    expect(useCart.getState().setChannel("GOFOOD", () => 30_000)).toBe(true);
    expect(useCart.getState()).toMatchObject({ channelId: "GOFOOD", lines: [{ unitPrice: 30_000 }], externalRef: "" });

    useCart.getState().clear();
    expect(useCart.getState()).toMatchObject({ channelId: null, externalRef: "" });
  });

  it("keeps the guest's name for the sale and forgets it with the sale (P1-1)", () => {
    const useCart = createCartStore(cartStorage(() => createTestDb()));
    useCart.getState().setCustomerName("Andi");
    expect(useCart.getState().customerName).toBe("Andi");

    useCart.getState().clear();
    expect(useCart.getState().customerName).toBe("");
  });

  it("stays on its channel when a line is not sold on the other one", () => {
    const useCart = createCartStore(cartStorage(() => createTestDb()));
    useCart.getState().add(gudeg);

    expect(useCart.getState().setChannel("SHOPEE", () => null)).toBe(false);
    expect(useCart.getState()).toMatchObject({ channelId: null, lines: [{ unitPrice: 25_000 }] });
  });
});
