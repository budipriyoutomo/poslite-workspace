import Dexie, { type DexieOptions, type Table } from "dexie";

import type {
  AvailabilityOverrideRow,
  CashMovementRow,
  CategoryRow,
  DiningTableRow,
  ModifierGroupRow,
  ModifierOptionRow,
  OpenBillRow,
  OrderRow,
  OutboxRow,
  PaymentMethodRow,
  PaymentRow,
  RefundRow,
  PrinterConfigRow,
  PrintJobRow,
  ProductRow,
  PromotionRow,
  SalesChannelRow,
  SettingRow,
  ShiftRow,
  SyncStateRow,
  UserRow,
} from "./rows";

export class PosDb extends Dexie {
  // Master data (pulled from the server, read-only on the device)
  settings!: Table<SettingRow, string>;
  categories!: Table<CategoryRow, string>;
  products!: Table<ProductRow, string>;
  modifierGroups!: Table<ModifierGroupRow, string>;
  /** Pulled separately from their group; also embedded in modifierGroups.options for the UI. */
  modifierOptions!: Table<ModifierOptionRow, string>;
  paymentMethods!: Table<PaymentMethodRow, string>;
  users!: Table<UserRow, string>;
  diningTables!: Table<DiningTableRow, string>;
  promotions!: Table<PromotionRow, string>;
  salesChannels!: Table<SalesChannelRow, string>;

  // Transactional (created on the device)
  shifts!: Table<ShiftRow, string>;
  orders!: Table<OrderRow, string>;
  payments!: Table<PaymentRow, string>;
  refunds!: Table<RefundRow, string>;
  cashMovements!: Table<CashMovementRow, string>;
  /** Sold-out marks made here, until the server has them (P1-2). */
  availabilityOverrides!: Table<AvailabilityOverrideRow, string>;
  /** Unpaid dine-in bills: this device's own (ADR-015), or copies of the outlet's shared bills (ADR-031). */
  openBills!: Table<OpenBillRow, string>;

  // Infrastructure
  outbox!: Table<OutboxRow, number>;
  syncState!: Table<SyncStateRow, string>;
  printers!: Table<PrinterConfigRow, string>;
  printJobs!: Table<PrintJobRow, string>;

  constructor(name = "poslite", options?: DexieOptions) {
    super(name, options);
    // Schema changes = a new version(n) with upgrade(); never edit an existing version.
    this.version(1).stores({
      settings: "key",
      categories: "id, sortOrder",
      products: "id, categoryId, sku, name",
      modifierGroups: "id",
      paymentMethods: "id, type, sortOrder",
      users: "id",
      shifts: "id, status, openedAt",
      orders: "id, shiftId, status, createdAt, businessDate, receiptNo, syncStatus",
      payments: "id, orderId",
      cashMovements: "id, shiftId",
      // [status+seq]: next push batch without scanning the whole outbox (Fase 0 Dexie spike)
      outbox: "++seq, [status+seq], createdAt, aggregateId",
      syncState: "key",
      printers: "id, role",
      printJobs: "id, status, createdAt",
    });
    // v2 (Fase 2 sync): the server sends modifier options as their own entity.
    this.version(2).stores({ modifierOptions: "id, modifierGroupId" });
    // v3 (Fase 4): tables and promotions from the server, open bills kept on this device only.
    this.version(3).stores({ diningTables: "id, sortOrder", promotions: "id", openBills: "id, tableId, openedAt" });
    // v4 (ADR-021): products keep an object key, the URL is built from the server's media base URL.
    this.version(4).upgrade((tx) =>
      tx
        .table("products")
        .toCollection()
        .modify((p: Record<string, unknown>) => {
          p.imageKey = p.imageUrl ?? null;
          delete p.imageUrl;
        }),
    );
    // v5 (ADR-023): refund documents; void and refund state on orders needs no index.
    this.version(5).stores({ refunds: "id, orderId, shiftId, businessDate, createdAt, syncStatus" });
    // v6 (ADR-029): sales channels from the server, each with its price list embedded.
    this.version(6).stores({ salesChannels: "id, sortOrder" });
    // v7 (ADR-031): shared open bills of a table-service outlet; the bills already here are this device's own.
    this.version(7)
      .stores({ openBills: "id, tableId, openedAt, origin" })
      .upgrade((tx) =>
        tx
          .table("openBills")
          .toCollection()
          .modify((b: Record<string, unknown>) => {
            b.origin = "local";
          }),
      );
    // v8 (P1-2): sold-out marks made on this device, shown at once even offline.
    this.version(8).stores({ availabilityOverrides: "productId" });
  }
}

let instance: PosDb | undefined;

/** The app's database, opened lazily so prerendering never touches IndexedDB. */
export function getDb(): PosDb {
  instance ??= new PosDb();
  return instance;
}
