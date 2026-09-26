import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

import { getDb } from "@/shared/db";

import { addLine, type CartLine, changeQuantity, type LineDiscount, type NewLine, removeLine, setLineDiscount, updateLine } from "../domain/cart";
import { cartStorage } from "../infrastructure/cart-storage";

/** Same shape as checkout's Discount (features share data shapes, not imports). */
export interface CartDiscount {
  type: "percentage" | "fixed";
  value: number;
}

/** The dine-in bill this cart is working on (ADR-015); null = a take-away sale. */
export interface CartBill {
  id: string;
  tableId: string | null;
  tableLabel: string;
  openedBy: string;
  openedAt: string;
}

interface CartState {
  lines: CartLine[];
  discount: CartDiscount | null;
  bill: CartBill | null;
  loadBill: (bill: CartBill, lines: CartLine[], discount: CartDiscount | null) => void;
  /** Turn the current lines into a dine-in bill, or back into take-away (null). */
  setBill: (bill: CartBill | null) => void;
  add: (line: NewLine) => void;
  changeQuantity: (key: string, delta: number) => void;
  update: (key: string, change: Pick<NewLine, "modifiers" | "note">) => void;
  remove: (key: string) => void;
  setLineDiscount: (key: string, discount: LineDiscount | null) => void;
  setDiscount: (discount: CartDiscount | null) => void;
  clear: () => void;
}

export function createCartStore(storage: StateStorage) {
  return create<CartState>()(
    persist(
      (set) => ({
        lines: [],
        discount: null,
        bill: null,
        loadBill: (bill, lines, discount) => set({ bill, lines, discount }),
        setBill: (bill) => set({ bill }),
        add: (line) => set((s) => ({ lines: addLine(s.lines, line) })),
        changeQuantity: (key, delta) => set((s) => ({ lines: changeQuantity(s.lines, key, delta) })),
        update: (key, change) => set((s) => ({ lines: updateLine(s.lines, key, change) })),
        remove: (key) => set((s) => ({ lines: removeLine(s.lines, key) })),
        setLineDiscount: (key, discount) => set((s) => ({ lines: setLineDiscount(s.lines, key, discount) })),
        setDiscount: (discount) => set({ discount }),
        clear: () => set({ lines: [], discount: null, bill: null }),
      }),
      {
        name: "cart",
        storage: createJSONStorage(() => storage),
        partialize: (s) => ({ lines: s.lines, discount: s.discount, bill: s.bill }),
      },
    ),
  );
}

/** The active cart: survives a reload or tablet restart (02-frontend-architecture.md "State Management"). */
export const useCart = createCartStore(cartStorage(getDb));
