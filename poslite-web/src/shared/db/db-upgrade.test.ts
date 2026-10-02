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
