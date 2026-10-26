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
  receiptHeader: string; // already resolved by the server: the outlet's own text, else the brand's
  receiptFooter: string;
  brand?: BrandIdentityRow; // ADR-022; missing on a device set up by a server before brands
  discountPolicy?: DiscountPolicyRow; // the brand's manual-discount rules; missing = DEFAULT_DISCOUNT_POLICY
  priceIncludesTax?: boolean; // the brand's prices include service and PB1 (ADR-030); missing = they do not
  blindClose?: boolean; // cashiers close shifts without seeing the expected cash (15 · UX-02); missing = they do
  serviceMode?: ServiceMode; // ADR-031; missing = counter
  cashRounding?: { unit: number; mode: "nearest" | "down" }; // P1-3; missing = off
}

/** ADR-031: open bills kept on each device (counter) or shared through the server (table_service). */
export type ServiceMode = "counter" | "table_service";

/** A brand's manual-discount rules (06 Order rule 5). */
export interface DiscountPolicyRow {
  percentages: number[];
  amounts: number[];
  allowCustom: boolean;
  cashierMaxPercentage: number;
  cashierMaxAmount: number;
}

/** What a device used before brands had a policy: the old presets and a 20% / Rp 50.000 limit. */
export const DEFAULT_DISCOUNT_POLICY: DiscountPolicyRow = {
  percentages: [5, 10, 15, 20],
  amounts: [5_000, 10_000, 25_000, 50_000],
  allowCustom: true,
  cashierMaxPercentage: 20,
  cashierMaxAmount: 50_000,
};

export interface BrandIdentityRow {
  id: string;
  code: string;
  name: string;
  logoKey: string | null; // object key; URL = mediaBaseUrl + key (ADR-021)
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
  imageKey: string | null; // object key; URL = mediaBaseUrl + key (ADR-021)
  isAvailable: boolean;
  /** The outlet's sold-out mark lifts by itself then (P1-2); absent = no end time or not sold out. */
  unavailableUntil?: string | null;
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

/** A waiter takes orders on a table-service outlet but never takes money (ADR-031). */
export type UserRole = "owner" | "manager" | "cashier" | "waiter";

/** Who may approve voids, refunds and discounts over the limit (never a cashier or a waiter). */
export const isManager = (role: UserRole | undefined): boolean => role === "owner" || role === "manager";

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
  /** The sales channel and the delivery app's order number (ADR-029); absent on older rows. */
  channelId?: string | null;
  channelName?: string | null;
  externalRef?: string | null;
  /** Called out at the counter for take-away and delivery (P1-1): `<device code>-<seq>`, e.g. A-012. */
  queueNo?: string | null;
  customerName?: string | null;
  /** Cash rounding (P1-3): added to the cash part, may be negative; the total never changes. */
  rounding?: number;
  lines: OrderLineRow[];
  discount: { type: "percentage" | "fixed"; value: number } | null;
  rates: { serviceBps: number; taxBps: number; includesTax?: boolean };
  subtotal: number;
  discountAmount: number;
  serviceCharge: number;
  tax: number;
  total: number;
  paidAmount: number;
  changeAmount: number;
  status: "paid" | "voided";
  /** Set by a void (ADR-023); the order's amounts never change. */
  voidedAt?: string;
  voidReason?: string;
  /** Who voided and who approved (null = a manager acting alone) — local, for the void slip. */
  voidedBy?: string;
  voidApprovedBy?: string | null;
  syncStatus: "pending" | "synced";
  flags: string[];
  createdAt: string;
}

/** A refund document made on this device (ADR-023): counted on its own shift and business day. */
export interface RefundRow {
  id: string;
  orderId: string;
  receiptNo: string; // of the refunded order, for the history list
  shiftId: string;
  refundNo: string; // {OUTLET}{DEVICE}-R{YYMMDD}-{SEQ}
  businessDate: string;
  reason: string;
  refundedBy: string;
  approvedBy: string | null;
  lines: { orderLineId: string; productName: string; quantity: number; amount: number }[];
  total: number;
  payments: { id: string; paymentMethodId: string; methodType: PaymentMethodType; methodName: string; amount: number; reference: string | null }[];
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

export type OutboxEventType = "shift.opened" | "shift.closed" | "order.placed" | "order.voided" | "order.refunded" | "cash.moved" | "bill.item_voided" | "product.availability_changed";

/** A sold-out mark made on this device (P1-2): shown at once, offline too, until the server has it. */
export interface AvailabilityOverrideRow {
  productId: string;
  isAvailable: boolean;
  until: string | null; // lifts by itself then; null = until switched back on
  changedAt: string;
}

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
  | { key: "refundCounter"; value: { businessDate: string; seq: number } } // ADR-023
  | { key: "queueCounter"; value: { businessDate: string; seq: number } } // P1-1, per device per business day
  | { key: "pinLockout"; value: { failures: number; lockedUntil: string | null } }
  | { key: "cart"; value: string } // serialized by the cart store (survives reload / tablet restart)
  | { key: "session"; value: string } // serialized by the session store (logged-in cashier)
  | { key: "device"; value: DeviceState }
  | { key: "pullCursor"; value: number }
  | { key: "lastSyncAt"; value: string }
  | { key: "mediaBaseUrl"; value: string } // from every pull page: follows an S3 vendor switch
  | { key: "recentLogins"; value: string[] } // user ids, most recent first: the lock screen opens on the first
  | { key: "serviceMode"; value: ServiceMode }; // the mode this device works in (ADR-031 rule 1)

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

/**
 * Web Serial: `getInfo()` fields · Web Bluetooth: device id · WebUSB: vendor/product/serial ·
 * network (Epson ePOS, Print Bridge): `address` = printer host[:port], plus the bridge URL and token.
 */
export interface PrinterDevice {
  usbVendorId?: number;
  usbProductId?: number;
  usbSerialNumber?: string;
  bluetoothServiceClassId?: number | string;
  bluetoothDeviceId?: string;
  name?: string;
  address?: string;
  bridgeUrl?: string;
  bridgeToken?: string;
}

export interface PrinterConfigRow {
  id: string;
  role: "receipt" | "kitchen" | "bar";
  /** `same-as-receipt`: a kitchen/bar role printed on this device's receipt printer (one-printer warung). */
  driver: "system" | "web-serial" | "web-bluetooth" | "web-usb" | "epson-epos" | "bridge" | "same-as-receipt";
  name: string;
  paperWidth: 58 | 80;
  /** How the driver finds the printer again without a dialog; not indexed. */
  device?: PrinterDevice;
}

export interface PrintJobRow {
  id: string;
  orderId: string;
  /** Absent on rows from before Fase 7 = "receipt". */
  documentType?: "receipt" | "void_slip" | "refund_slip" | "kitchen_ticket";
  refundId?: string;
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

/** Where a sale comes from and how it is priced (ADR-029); pulled, inactive ones are deleted. */
export interface SalesChannelRow {
  id: string;
  code: string;
  name: string;
  kind: "dine_in" | "take_away" | "delivery";
  priceMode: "base" | "markup_bps" | "price_list";
  markupBps: number;
  markupRoundingUnit: number;
  defaultPaymentMethodId: string | null;
  appliesService: boolean;
  appliesTax: boolean;
  requiresExternalRef: boolean;
  sortOrder: number;
  /** price_list channels: productId → price; a product missing here is not sold on the channel. */
  prices: Record<string, number>;
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
  /** Units already on a kitchen/bar ticket (Fase 7); absent = none. */
  sentQuantity?: number;
}

/**
 * A dine-in bill not paid yet. At a counter outlet it lives only on this device (ADR-015); at a
 * table-service outlet it is a copy of the server's bill, edited by one device at a time (ADR-031).
 */
export interface OpenBillRow {
  id: string;
  tableId: string | null;
  tableLabel: string;
  lines: OpenBillLine[];
  discount: LineDiscount | null; // order discount
  openedBy: string;
  openedAt: string;
  updatedAt: string;
  /** `local`: only on this device (counter mode, or opened offline and not uploaded yet). */
  origin?: "local" | "server";
  /** The server version this copy is based on; a save names it. */
  serverVersion?: number | null;
  /** Changed here and not on the server yet. */
  dirty?: boolean;
  /** Until when this device may edit the bill (its lease). */
  leaseUntil?: string | null;
  /** Another device is editing the bill: read-only here. */
  leaseHolder?: { deviceName: string; userId: string; until: string } | null;
  /** This device's edit the server refused (another device changed the bill): shown, never merged. */
  conflict?: { lines: OpenBillLine[]; at: string } | null;
}
