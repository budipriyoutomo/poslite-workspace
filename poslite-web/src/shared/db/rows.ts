// IndexedDB row shapes (03-offline-sync.md). Money is integer Rupiah, rates are basis points,
// ids are client ULIDs, timestamps are ISO 8601 UTC strings.

// ── Master data: pulled from the server, read-only on the device ────────────────────────────

export interface OutletSetting {
  outletId: string;
  outletCode: string; // e.g. JKT01
  outletName: string;
  deviceId: string;
  deviceCode: string; // e.g. A
  timezone: string; // IANA, e.g. Asia/Jakarta
  businessDayCutoff: string; // HH:MM
  serviceBps: number;
  taxBps: number;
  receiptHeader: string;
  receiptFooter: string;
}

export type SettingRow = { key: "outlet"; value: OutletSetting };

export interface CategoryRow {
  id: string;
  name: string;
  sortOrder: number;
  printRole: "receipt" | "kitchen" | "bar";
}

export interface ProductRow {
  id: string;
  categoryId: string;
  sku: string;
  name: string;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
  modifierGroupIds: string[];
}

export interface ModifierGroupRow {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: { id: string; name: string; price: number }[];
}

export type PaymentMethodType = "cash" | "debit" | "qris" | "credit_card" | "voucher" | "other";

export interface PaymentMethodRow {
  id: string;
  type: PaymentMethodType;
  name: string;
  requiresReference: boolean;
  sortOrder: number;
}

export type UserRole = "owner" | "manager" | "cashier";

export interface UserRow {
  id: string;
  name: string;
  role: UserRole;
  pinHash: string; // base64 PBKDF2-SHA256
  pinSalt: string; // base64
  pinIterations: number;
}

// ── Transactional data: created on the device, immutable once written ──────────────────────

export interface ShiftRow {
  id: string;
  openedBy: string;
  openedAt: string;
  openingCash: number;
  businessDate: string;
  status: "open" | "closed";
  closedBy?: string;
  closedAt?: string;
  expectedCash?: number;
  countedCash?: number;
  variance?: number;
}

export interface OrderLineRow {
  id: string;
  productId: string;
  productName: string;
  categoryName: string;
  unitPrice: number;
  quantity: number;
  notes: string;
  modifiers: { modifierOptionId: string; name: string; price: number }[];
  /** Line discount (manual or promotion) and the promotion snapshot — Fase 4, absent on older rows. */
  discount?: LineDiscount | null;
  promotion?: { id: string; name: string } | null;
}

export interface OrderRow {
  id: string;
  shiftId: string;
  receiptNo: string;
  cashierId: string;
  cashierName: string;
  businessDate: string;
  orderType: "take_away" | "dine_in";
  tableLabel?: string | null;
  lines: OrderLineRow[];
  discount: { type: "percentage" | "fixed"; value: number } | null;
  rates: { serviceBps: number; taxBps: number };
  subtotal: number;
  discountAmount: number;
  serviceCharge: number;
  tax: number;
  total: number;
  paidAmount: number;
  changeAmount: number;
  status: "paid" | "voided";
  syncStatus: "pending" | "synced";
  flags: string[];
  createdAt: string;
}

export interface PaymentRow {
  id: string;
  orderId: string;
  paymentMethodId: string;
  methodType: PaymentMethodType;
  methodName: string;
  amount: number;
  reference: string | null;
  createdAt: string;
}

export interface CashMovementRow {
  id: string;
  shiftId: string;
  type: "in" | "out";
  amount: number;
  reason: string;
  createdBy: string;
  createdAt: string;
}

// ── Infrastructure ──────────────────────────────────────────────────────────────────────────

export type OutboxEventType = "shift.opened" | "shift.closed" | "order.placed" | "order.voided" | "cash.moved";

export interface OutboxRow {
  seq?: number; // local auto-increment → send order
  id: string; // ULID = idempotency key
  type: OutboxEventType;
  aggregateId: string;
  occurredAt: string;
  payload: unknown; // validated with Zod before enqueue
  status: "pending" | "sending" | "failed" | "dead";
  attempts: number;
  lastError?: string;
  /** Earliest retry after a failed send (exponential backoff). */
  nextAttemptAt?: string;
  createdAt: string;
}

/** Device-local state that is never pulled from the server. */
export type SyncStateRow =
  | { key: "receiptCounter"; value: { businessDate: string; seq: number } }
  | { key: "pinLockout"; value: { failures: number; lockedUntil: string | null } }
  | { key: "cart"; value: string } // serialized by the cart store (survives reload / tablet restart)
  | { key: "session"; value: string } // serialized by the session store (logged-in cashier)
  | { key: "device"; value: DeviceState }
  | { key: "pullCursor"; value: number }
  | { key: "lastSyncAt"; value: string };

/** How this device talks to the server: an activated device, or the offline demo (no server). */
export type DeviceState =
  | { mode: "server"; deviceId: string; deviceCode: string; outletId: string; token: string }
  | { mode: "demo" };

export interface ModifierOptionRow {
  id: string;
  modifierGroupId: string;
  name: string;
  price: number;
  sortOrder: number;
}

export interface PrinterConfigRow {
  id: string;
  role: "receipt" | "kitchen" | "bar";
  driver: "system" | "web-serial" | "web-bluetooth" | "web-usb";
  name: string;
  paperWidth: 58 | 80;
}

export interface PrintJobRow {
  id: string;
  orderId: string;
  status: "queued" | "printed" | "failed";
  attempts: number;
  lastError?: string;
  createdAt: string;
}

// ── Fase 4: dine-in & promotions (ADR-015, ADR-016) ─────────────────────────────────────────

export interface DiningTableRow {
  id: string;
  label: string;
  area: string;
  seats: number;
  sortOrder: number;
}

export interface PromotionRow {
  id: string;
  name: string;
  type: "percent_off" | "buy_x_get_y";
  percentage: number | null; // integer 1..100
  buyQty: number | null;
  getQty: number | null;
  productIds: string[];
  categoryIds: string[];
  daysOfWeek: number[]; // ISO 1 = Monday … 7 = Sunday; empty = every day
  startTime: string | null; // HH:MM, outlet time
  endTime: string | null;
  startsOn: string | null; // YYYY-MM-DD, outlet date
  endsOn: string | null;
}

export type LineDiscount = { type: "percentage" | "fixed"; value: number };

/** A cart line kept on an open bill (same shape as the cart feature's CartLine). */
export interface OpenBillLine {
  key: string;
  productId: string;
  categoryId?: string;
  name: string;
  categoryName: string;
  unitPrice: number;
  modifiers: { optionId: string; groupId: string; name: string; price: number }[];
  note: string;
  quantity: number;
  discount?: LineDiscount | null;
}

/** A dine-in bill not paid yet: lives only on this device, never synced (ADR-015). */
export interface OpenBillRow {
  id: string;
  tableId: string | null;
  tableLabel: string;
  lines: OpenBillLine[];
  discount: LineDiscount | null; // order discount
  openedBy: string;
  openedAt: string;
  updatedAt: string;
}
