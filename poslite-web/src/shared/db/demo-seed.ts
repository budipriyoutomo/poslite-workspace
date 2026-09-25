// Demo master data until device activation + sync pull exist (Fase 2). It only seeds a device that
// has never been set up, and never overwrites anything. Menu and add-ons come from the v0 prototype.
import type { PosDb } from "./db";
import type { CategoryRow, ModifierGroupRow, OutletSetting, PaymentMethodRow, ProductRow, UserRow } from "./rows";

// Fixed, valid ULIDs: 01K5Z + kind letter + 20 digits.
const id = (kind: "C" | "P" | "G" | "M" | "Y" | "A" | "T" | "D", n: number) => `01K5Z${kind}${String(n).padStart(20, "0")}`;

const OUTLET: OutletSetting = {
  outletId: id("T", 1),
  outletCode: "JKT01",
  outletName: "POSLite Demo — Kemang",
  deviceId: id("D", 1),
  deviceCode: "A",
  timezone: "Asia/Jakarta",
  businessDayCutoff: "04:00",
  serviceBps: 500,
  taxBps: 1_000,
  receiptHeader: "POSLite Demo\nJl. Kemang Raya No. 1, Jakarta",
  receiptFooter: "Terima kasih atas kunjungan Anda",
};

/** Demo logins (PBKDF2-SHA256, 310.000 iterations, like the server). */
export const DEMO_USERS: { name: string; pin: string }[] = [
  { name: "Siti", pin: "1234" },
  { name: "Budi", pin: "9999" },
];

const USERS: UserRow[] = [
  { id: id("A", 1), name: "Siti", role: "cashier", pinSalt: "c2l0aS1kZW1vLXNhbHQtMDE=", pinHash: "PWpXSHzgALwud0m3qudNzC+yuXC58v29K5NDUravPHw=", pinIterations: 310_000 },
  { id: id("A", 2), name: "Budi", role: "manager", pinSalt: "YnVkaS1kZW1vLXNhbHQtMDE=", pinHash: "5pnOubR8K7JV4brSsrjKAyNmHtwiP3ws1UdSJFFvL34=", pinIterations: 310_000 },
];

const CATEGORIES: CategoryRow[] = [
  { id: id("C", 1), name: "Makanan", sortOrder: 1, printRole: "kitchen" },
  { id: id("C", 2), name: "Minuman", sortOrder: 2, printRole: "bar" },
];

let optionSeq = 0;
const options = (...items: [string, number][]) => items.map(([name, price]) => ({ id: id("M", ++optionSeq), name, price }));

const GROUPS: ModifierGroupRow[] = [
  { id: id("G", 1), name: "Tambahan", minSelect: 0, maxSelect: 3, options: options(["Tambah Ayam", 10_000], ["Tambah Telur", 5_000], ["Extra Krecek", 3_000]) },
  { id: id("G", 2), name: "Tambahan", minSelect: 0, maxSelect: 2, options: options(["Tambah Lontong", 5_000], ["Extra Bumbu Kacang", 3_000]) },
  { id: id("G", 3), name: "Tambahan", minSelect: 0, maxSelect: 3, options: options(["Tambah Bakso", 5_000], ["Extra Mie", 3_000], ["Tambah Tahu", 2_000]) },
  { id: id("G", 4), name: "Tambahan", minSelect: 0, maxSelect: 2, options: options(["Tambah Telur", 5_000], ["Tambah Ayam", 8_000]) },
  { id: id("G", 5), name: "Level Gula", minSelect: 1, maxSelect: 1, options: options(["Normal", 0], ["Less Sugar", 0], ["Tanpa Gula", 0]) },
  { id: id("G", 6), name: "Topping", minSelect: 0, maxSelect: 1, options: options(["Extra Boba", 5_000]) },
  { id: id("G", 7), name: "Tambahan", minSelect: 0, maxSelect: 1, options: options(["Extra Shot", 5_000]) },
  { id: id("G", 8), name: "Tambahan", minSelect: 0, maxSelect: 2, options: options(["Extra Susu", 3_000], ["Tambah Madu", 2_000]) },
];

const product = (n: number, category: 1 | 2, sku: string, name: string, price: number, image: string | null, groups: number[]): ProductRow => ({
  id: id("P", n),
  categoryId: id("C", category),
  sku,
  name,
  price,
  imageUrl: image && `/products/${image}.jpg`,
  isAvailable: true,
  modifierGroupIds: groups.map((g) => id("G", g)),
});

const PRODUCTS: ProductRow[] = [
  product(1, 1, "MK-001", "Nasi Gudeg", 25_000, "nasi-gudeg", [1]),
  product(2, 1, "MK-002", "Sate Ayam", 30_000, "grilled-chicken-satay", [2]),
  product(3, 1, "MK-003", "Bakso Spesial", 20_000, "bakso-indonesian-meatball-soup", [3]),
  product(4, 1, "MK-004", "Nasi Goreng", 22_000, null, [4]),
  product(5, 2, "MN-001", "Es Teh Manis", 5_000, "es-teh-manis-glass", [5, 6]),
  product(6, 2, "MN-002", "Kopi Tubruk", 8_000, "kopi-tubruk", [5, 7]),
  product(7, 2, "MN-003", "Jus Alpukat", 15_000, null, [8]),
  product(8, 2, "MN-004", "Air Mineral", 5_000, null, []),
];

const method = (n: number, type: PaymentMethodRow["type"], name: string, requiresReference = false): PaymentMethodRow => ({
  id: id("Y", n),
  type,
  name,
  requiresReference,
  sortOrder: n,
});

const PAYMENT_METHODS: PaymentMethodRow[] = [
  method(1, "cash", "Tunai"),
  method(2, "qris", "QRIS"),
  method(3, "debit", "Debit BCA", true),
  method(4, "debit", "Debit Mandiri", true),
  method(5, "debit", "Debit BRI", true),
  method(6, "debit", "Debit BNI", true),
  method(7, "credit_card", "Visa", true),
  method(8, "credit_card", "Mastercard", true),
  method(9, "voucher", "GrabFood Voucher", true),
  method(10, "voucher", "GoFood Voucher", true),
];

/** Seeds an empty device with demo master data. Returns true when it seeded. */
export async function ensureDemoData(db: PosDb): Promise<boolean> {
  return db.transaction("rw", [db.settings, db.users, db.categories, db.modifierGroups, db.products, db.paymentMethods], async () => {
    if (await db.settings.get("outlet")) return false;
    await db.settings.put({ key: "outlet", value: OUTLET });
    await db.users.bulkPut(USERS);
    await db.categories.bulkPut(CATEGORIES);
    await db.modifierGroups.bulkPut(GROUPS);
    await db.products.bulkPut(PRODUCTS);
    await db.paymentMethods.bulkPut(PAYMENT_METHODS);
    return true;
  });
}
