import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

import { getDb } from "@/shared/db";

import { addLine, type CartLine, changeQuantity, type LineDiscount, type NewLine, removeLine, repriceLines, setLineDiscount, updateLine } from "../domain/cart";
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
  /** Guests at the table (15 · UX-04); null = not asked. */
  guestCount?: number | null;
}

interface CartState {
  lines: CartLine[];
  discount: CartDiscount | null;
  /** Promotions the cashier chose at payment (ADR-016); none applies unless chosen. */
  promotionIds: string[];
  bill: CartBill | null;
  /** The sales channel chosen for this sale (ADR-029); null = the brand's default for its kind. */
  channelId: string | null;
  /** The delivery app's order number, for channels that need it. */
  externalRef: string;
  /** The guest's name, called out with the queue number for take-away and delivery (P1-1). */
  customerName: string;
  /** Opens a bill; the chosen promotions start empty unless handed over (e.g. after a split payment). */
  loadBill: (bill: CartBill, lines: CartLine[], discount: CartDiscount | null, promotionIds?: string[]) => void;
  /** Turn the current lines into a dine-in bill, or back into take-away (null). */
  setBill: (bill: CartBill | null) => void;
  add: (line: NewLine) => void;
  changeQuantity: (key: string, delta: number) => void;
  update: (key: string, change: Pick<NewLine, "modifiers" | "note">) => void;
  remove: (key: string) => void;
  setLineDiscount: (key: string, discount: LineDiscount | null) => void;
  setDiscount: (discount: CartDiscount | null) => void;
  togglePromotion: (id: string) => void;
  /** Moves the sale to a channel at its prices; false (nothing changes) if a line is not sold there. */
  setChannel: (channelId: string | null, priceOf: (productId: string) => number | null) => boolean;
  setExternalRef: (ref: string) => void;
  setCustomerName: (name: string) => void;
  clear: () => void;
}

/** An emptied cart starts the next sale: a promotion chosen for the old one must not carry over. */
const withLines = (s: CartState, lines: CartLine[]) => ({ lines, promotionIds: lines.length === 0 ? [] : s.promotionIds });

export function createCartStore(storage: StateStorage) {
  return create<CartState>()(
    persist(
      (set, get) => ({
        lines: [],
        discount: null,
        promotionIds: [],
        bill: null,
        channelId: null,
        externalRef: "",
        customerName: "",
        loadBill: (bill, lines, discount, promotionIds = []) => set({ bill, lines, discount, promotionIds }),
        setBill: (bill) => set({ bill }),
        add: (line) => set((s) => ({ lines: addLine(s.lines, line) })),
        changeQuantity: (key, delta) => set((s) => withLines(s, changeQuantity(s.lines, key, delta))),
        update: (key, change) => set((s) => ({ lines: updateLine(s.lines, key, change) })),
        remove: (key) => set((s) => withLines(s, removeLine(s.lines, key))),
        setLineDiscount: (key, discount) => set((s) => ({ lines: setLineDiscount(s.lines, key, discount) })),
        setDiscount: (discount) => set({ discount }),
        togglePromotion: (id) => set((s) => ({ promotionIds: s.promotionIds.includes(id) ? s.promotionIds.filter((p) => p !== id) : [...s.promotionIds, id] })),
        setChannel: (channelId, priceOf) => {
          const lines = repriceLines(get().lines, priceOf);
          if (lines === null) return false;
          set({ channelId, lines, externalRef: "" });
          return true;
        },
        setExternalRef: (externalRef) => set({ externalRef }),
        setCustomerName: (customerName) => set({ customerName }),
        clear: () => set({ lines: [], discount: null, promotionIds: [], bill: null, channelId: null, externalRef: "", customerName: "" }),
      }),
      {
        name: "cart",
        storage: createJSONStorage(() => storage),
        partialize: (s) => ({ lines: s.lines, discount: s.discount, promotionIds: s.promotionIds, bill: s.bill, channelId: s.channelId, externalRef: s.externalRef, customerName: s.customerName }),
        // A tap that lands before the stored cart loaded (a busy device) is newer: keep it.
        merge: (stored, current) => (current.lines.length > 0 ? current : { ...current, ...(stored as Partial<CartState>) }),
      },
    ),
  );
}

/** The active cart: survives a reload or tablet restart (02-frontend-architecture.md "State Management"). */
export const useCart = createCartStore(cartStorage(getDb));
