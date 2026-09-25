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
});
