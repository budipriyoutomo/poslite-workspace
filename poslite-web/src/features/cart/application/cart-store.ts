import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

import { getDb } from "@/shared/db";

import { addLine, type CartLine, changeQuantity, type NewLine, removeLine, updateLine } from "../domain/cart";
import { cartStorage } from "../infrastructure/cart-storage";

/** Same shape as checkout's Discount (features share data shapes, not imports). */
export interface CartDiscount {
  type: "percentage" | "fixed";
  value: number;
}

interface CartState {
  lines: CartLine[];
  discount: CartDiscount | null;
  add: (line: NewLine) => void;
  changeQuantity: (key: string, delta: number) => void;
  update: (key: string, change: Pick<NewLine, "modifiers" | "note">) => void;
  remove: (key: string) => void;
  setDiscount: (discount: CartDiscount | null) => void;
  clear: () => void;
}

export function createCartStore(storage: StateStorage) {
  return create<CartState>()(
    persist(
      (set) => ({
        lines: [],
        discount: null,
        add: (line) => set((s) => ({ lines: addLine(s.lines, line) })),
        changeQuantity: (key, delta) => set((s) => ({ lines: changeQuantity(s.lines, key, delta) })),
        update: (key, change) => set((s) => ({ lines: updateLine(s.lines, key, change) })),
        remove: (key) => set((s) => ({ lines: removeLine(s.lines, key) })),
        setDiscount: (discount) => set({ discount }),
        clear: () => set({ lines: [], discount: null }),
      }),
      {
        name: "cart",
        storage: createJSONStorage(() => storage),
        partialize: (s) => ({ lines: s.lines, discount: s.discount }),
      },
    ),
  );
}

/** The active cart: survives a reload or tablet restart (02-frontend-architecture.md "State Management"). */
export const useCart = createCartStore(cartStorage(getDb));
