import Dexie from "dexie";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { expect, it } from "vitest";

import { PosDb } from "./db";

it("v4 keeps a product's image as imageKey (ADR-021)", async () => {
  const indexedDB = new IDBFactory();
  const old = new Dexie("poslite-upgrade", { indexedDB, IDBKeyRange });
  old.version(3).stores({ products: "id, categoryId, sku, name" });
  await old.table("products").put({ id: "P1", name: "Es Teh", imageUrl: "https://old.example.com/teh.jpg" });
  old.close();

  const db = new PosDb("poslite-upgrade", { indexedDB, IDBKeyRange });
  const product = (await db.products.get("P1")) as unknown as Record<string, unknown>;

  expect(product.imageKey).toBe("https://old.example.com/teh.jpg");
  expect(product).not.toHaveProperty("imageUrl");
});

it("v5 keeps orders and adds the refunds table (ADR-023)", async () => {
  const indexedDB = new IDBFactory();
  const old = new Dexie("poslite-upgrade-5", { indexedDB, IDBKeyRange });
  old.version(4).stores({ orders: "id, shiftId, status, createdAt, businessDate, receiptNo, syncStatus" });
  await old.table("orders").put({ id: "O1", shiftId: "S1", status: "paid", createdAt: "2026-10-07", businessDate: "2026-10-07", receiptNo: "A-1", syncStatus: "synced" });
  old.close();

  const db = new PosDb("poslite-upgrade-5", { indexedDB, IDBKeyRange });

  expect((await db.orders.get("O1"))?.receiptNo).toBe("A-1");
  expect(await db.refunds.where("orderId").equals("O1").count()).toBe(0);
});

it("v7 marks the bills already on the device as local (ADR-031)", async () => {
  const indexedDB = new IDBFactory();
  const old = new Dexie("poslite-upgrade-7", { indexedDB, IDBKeyRange });
  old.version(6).stores({ openBills: "id, tableId, openedAt" });
  await old.table("openBills").put({
    id: "B1",
    tableId: null,
    tableLabel: "A3",
    lines: [],
    discount: null,
    openedBy: "U1",
    openedAt: "2026-10-24",
    updatedAt: "2026-10-24",
  });
  old.close();

  const db = new PosDb("poslite-upgrade-7", { indexedDB, IDBKeyRange });

  expect(await db.openBills.where("origin").equals("local").primaryKeys()).toEqual(["B1"]);
});
