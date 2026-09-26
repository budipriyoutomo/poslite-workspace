import Dexie, { type DexieOptions, type Table } from "dexie";

import type {
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
  PrinterConfigRow,
  PrintJobRow,
  ProductRow,
  PromotionRow,
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

  // Transactional (created on the device)
  shifts!: Table<ShiftRow, string>;
  orders!: Table<OrderRow, string>;
  payments!: Table<PaymentRow, string>;
  cashMovements!: Table<CashMovementRow, string>;
  /** Unpaid dine-in bills: device-local, never synced or pushed (ADR-015). */
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
  }
}

let instance: PosDb | undefined;

/** The app's database, opened lazily so prerendering never touches IndexedDB. */
export function getDb(): PosDb {
  instance ??= new PosDb();
  return instance;
}
