import { type ApiConfig, apiRequest } from "@/shared/api";
import { type DeviceState, type PosDb, readState, writeState } from "@/shared/db";
import { AppError } from "@/shared/errors";

import { type Change, pullPageSchema } from "../infrastructure/pull-schemas";

const PAGE_SIZE = 500;

type ServerDevice = Extract<DeviceState, { mode: "server" }>;
export type BaseApi = Omit<ApiConfig, "token" | "deviceId">;

/**
 * A sold-out mark made here (P1-2) gives way to the server's product once its event was pushed;
 * a mark still in the outbox stays, or the grid would flip back until the next sync.
 */
async function settleAvailability(db: PosDb, changes: Change[]): Promise<void> {
  const products = changes.filter((c) => c.entity === "product").map((c) => c.id);
  if (products.length === 0) return;
  const pending = new Set((await db.outbox.filter((e) => e.type === "product.availability_changed").toArray()).map((e) => e.aggregateId));
  await db.availabilityOverrides.bulkDelete(products.filter((id) => !pending.has(id)));
}

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
      case "sales_channel":
        return void (await db.salesChannels.delete(change.id));
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
          brand: d.brand && { id: d.brand.id, code: d.brand.code, name: d.brand.name, logoKey: d.brand.logo_key },
          discountPolicy: d.discount_policy && {
            percentages: d.discount_policy.percentages,
            amounts: d.discount_policy.amounts,
            allowCustom: d.discount_policy.allow_custom,
            cashierMaxPercentage: d.discount_policy.cashier_max_percentage,
            cashierMaxAmount: d.discount_policy.cashier_max_amount,
          },
          priceIncludesTax: d.price_includes_tax ?? false,
          serviceMode: d.service_mode ?? "counter",
          cashRounding: { unit: d.cash_rounding_unit ?? 0, mode: d.cash_rounding_mode ?? "nearest" },
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
        imageKey: d.image_key,
        isAvailable: d.is_available,
        unavailableUntil: d.unavailable_until ?? null,
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
    case "sales_channel": {
      const d = change.data;
      return void (await db.salesChannels.put({
        id: change.id,
        code: d.code,
        name: d.name,
        kind: d.kind,
        priceMode: d.price_mode,
        markupBps: d.markup_bps,
        markupRoundingUnit: d.markup_rounding_unit,
        defaultPaymentMethodId: d.default_payment_method_id,
        appliesService: d.applies_service,
        appliesTax: d.applies_tax,
        requiresExternalRef: d.requires_external_ref,
        sortOrder: d.sort_order,
        prices: Object.fromEntries(d.prices.map((p) => [p.product_id, p.price])),
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
    await db.transaction("rw", [db.settings, db.categories, db.products, db.modifierGroups, db.modifierOptions, db.paymentMethods, db.users, db.diningTables, db.promotions, db.salesChannels, db.syncState, db.availabilityOverrides, db.outbox], async () => {
      const touchedGroups = new Set<string>();
      for (const change of page.changes) await applyChange(db, change, device, touchedGroups);
      await embedOptions(db, touchedGroups);
      await settleAvailability(db, page.changes);
      await writeState(db, "pullCursor", page.next_cursor);
      await writeState(db, "mediaBaseUrl", page.media_base_url);
    });
    hasMore = page.has_more;
  }
}
