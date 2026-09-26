import { type ApiConfig, apiRequest } from "@/shared/api";
import { type DeviceState, type PosDb, readState, writeState } from "@/shared/db";
import { AppError } from "@/shared/errors";

import { type Change, pullPageSchema } from "../infrastructure/pull-schemas";

const PAGE_SIZE = 500;

type ServerDevice = Extract<DeviceState, { mode: "server" }>;
export type BaseApi = Omit<ApiConfig, "token" | "deviceId">;

export async function serverDevice(db: PosDb): Promise<ServerDevice> {
  const device = await readState(db, "device");
  if (device?.mode !== "server") throw new AppError("DEVICE_NOT_ACTIVATED");
  return device;
}

export function deviceApi(api: BaseApi, device: ServerDevice): ApiConfig {
  return { ...api, token: device.token, deviceId: device.deviceId };
}

async function applyChange(db: PosDb, change: Change, device: ServerDevice, touchedGroups: Set<string>): Promise<void> {
  if (change.op === "delete") {
    switch (change.entity) {
      case "outlet_setting":
        return; // never: a device's own outlet is not deleted under it
      case "category":
        return void (await db.categories.delete(change.id));
      case "product":
        return void (await db.products.delete(change.id));
      case "modifier_group":
        return void (await db.modifierGroups.delete(change.id));
      case "modifier_option": {
        const option = await db.modifierOptions.get(change.id);
        if (option) touchedGroups.add(option.modifierGroupId);
        return void (await db.modifierOptions.delete(change.id));
      }
      case "payment_method":
        return void (await db.paymentMethods.delete(change.id));
      case "user":
        return void (await db.users.delete(change.id));
      case "dining_table":
        return void (await db.diningTables.delete(change.id));
      case "promotion":
        return void (await db.promotions.delete(change.id));
    }
  }
  switch (change.entity) {
    case "outlet_setting": {
      const d = change.data;
      return void (await db.settings.put({
        key: "outlet",
        value: {
          outletId: device.outletId,
          outletCode: d.code,
          outletName: d.name,
          deviceId: device.deviceId,
          deviceCode: device.deviceCode,
          timezone: d.timezone,
          businessDayCutoff: d.business_day_cutoff,
          serviceBps: d.service_rate_bps,
          taxBps: d.tax_rate_bps,
          receiptHeader: d.receipt_header,
          receiptFooter: d.receipt_footer,
        },
      }));
    }
    case "category":
      return void (await db.categories.put({ id: change.id, name: change.data.name, sortOrder: change.data.sort_order, printRole: change.data.print_role }));
    case "product": {
      const d = change.data;
      return void (await db.products.put({
        id: change.id,
        categoryId: d.category_id,
        sku: d.sku,
        name: d.name,
        price: d.price,
        imageUrl: d.image_url,
        isAvailable: d.is_available,
        modifierGroupIds: d.modifier_group_ids,
      }));
    }
    case "modifier_group": {
      touchedGroups.add(change.id);
      const d = change.data;
      return void (await db.modifierGroups.put({ id: change.id, name: d.name, minSelect: d.min_select, maxSelect: d.max_select, options: [] }));
    }
    case "modifier_option": {
      const d = change.data;
      touchedGroups.add(d.modifier_group_id);
      const previous = await db.modifierOptions.get(change.id);
      if (previous) touchedGroups.add(previous.modifierGroupId);
      return void (await db.modifierOptions.put({ id: change.id, modifierGroupId: d.modifier_group_id, name: d.name, price: d.price, sortOrder: d.sort_order }));
    }
    case "payment_method": {
      const d = change.data;
      return void (await db.paymentMethods.put({ id: change.id, type: d.type, name: d.name, requiresReference: d.requires_reference, sortOrder: d.sort_order }));
    }
    case "user": {
      const d = change.data;
      // Without a PIN a user cannot log in on a device (back-office only).
      if (!d.pin_hash || !d.pin_salt || !d.pin_iterations) return void (await db.users.delete(change.id));
      return void (await db.users.put({ id: change.id, name: d.name, role: d.role, pinHash: d.pin_hash, pinSalt: d.pin_salt, pinIterations: d.pin_iterations }));
    }
    case "dining_table": {
      const d = change.data;
      return void (await db.diningTables.put({ id: change.id, label: d.label, area: d.area, seats: d.seats, sortOrder: d.sort_order }));
    }
    case "promotion": {
      const d = change.data;
      return void (await db.promotions.put({
        id: change.id,
        name: d.name,
        type: d.type,
        percentage: d.percentage,
        buyQty: d.buy_qty,
        getQty: d.get_qty,
        productIds: d.product_ids,
        categoryIds: d.category_ids,
        daysOfWeek: d.days_of_week,
        startTime: d.start_time,
        endTime: d.end_time,
        startsOn: d.starts_on,
        endsOn: d.ends_on,
      }));
    }
  }
}

/** Options arrive on their own; the UI reads them embedded in their group (schema v1 shape). */
async function embedOptions(db: PosDb, groupIds: Set<string>): Promise<void> {
  for (const groupId of groupIds) {
    const group = await db.modifierGroups.get(groupId);
    if (!group) continue;
    const options = (await db.modifierOptions.where("modifierGroupId").equals(groupId).sortBy("sortOrder")).map(({ id, name, price }) => ({ id, name, price }));
    await db.modifierGroups.put({ ...group, options });
  }
}

/**
 * Delta pull of master data (03-offline-sync.md): every page is validated, then applied together
 * with its cursor in one Dexie transaction — a failed page changes nothing.
 */
export async function pullAll(deps: { db: PosDb; api: BaseApi }): Promise<void> {
  const { db } = deps;
  const device = await serverDevice(db);
  const api = deviceApi(deps.api, device);
  let hasMore = true;
  while (hasMore) {
    const cursor = (await readState(db, "pullCursor")) ?? 0;
    const page = await apiRequest(api, "GET", `/sync/pull?cursor=${cursor}&limit=${PAGE_SIZE}`, pullPageSchema);
    await db.transaction("rw", [db.settings, db.categories, db.products, db.modifierGroups, db.modifierOptions, db.paymentMethods, db.users, db.diningTables, db.promotions, db.syncState], async () => {
      const touchedGroups = new Set<string>();
      for (const change of page.changes) await applyChange(db, change, device, touchedGroups);
      await embedOptions(db, touchedGroups);
      await writeState(db, "pullCursor", page.next_cursor);
    });
    hasMore = page.has_more;
  }
}
