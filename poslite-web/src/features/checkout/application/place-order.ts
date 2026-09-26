import { formatReceiptNo, nextReceiptCounter } from "@/features/orders";
import { applyPromotions, localMoment } from "@/features/promotions";
import { businessDate, getOpenShift } from "@/features/shift";
import { enqueueEvent } from "@/features/sync";
import type { OrderRow, PaymentRow, PosDb } from "@/shared/db";
import { getDb, readState, writeState } from "@/shared/db";
import { AppError } from "@/shared/errors";
import { newId } from "@/shared/id";

import { settle } from "../domain/payment";
import { calculate, type Discount } from "../domain/pricing";

export interface PlaceOrderInput {
  cashier: { id: string; name: string };
  orderType?: "take_away" | "dine_in";
  tableLabel?: string | null;
  lines: {
    productId: string;
    categoryId?: string;
    name: string;
    categoryName: string;
    unitPrice: number;
    quantity: number;
    note: string;
    modifiers: { optionId: string; name: string; price: number }[];
    /** The cashier's manual line discount; otherwise promotions decide (ADR-016). */
    discount?: Discount | null;
  }[];
  discount: Discount | null;
  payments: { paymentMethodId: string; amount: number; reference?: string | null }[];
}

export interface PlaceOrderDeps {
  db: PosDb;
  now: () => Date;
  newId: () => string;
}

const defaultDeps = (): PlaceOrderDeps => ({ db: getDb(), now: () => new Date(), newId });

/**
 * Sells offline: order, payments, receipt counter and the order.placed event are written in one
 * Dexie transaction — all or nothing (AGENTS.md §6). Printing and sync happen after, never inside.
 */
export async function placeOrder(input: PlaceOrderInput, deps: PlaceOrderDeps = defaultDeps()): Promise<OrderRow> {
  const { db } = deps;
  if (input.lines.length === 0) throw new AppError("EMPTY_CART");

  return db.transaction("rw", [db.settings, db.shifts, db.paymentMethods, db.promotions, db.orders, db.payments, db.syncState, db.outbox], async () => {
    const outlet = (await db.settings.get("outlet"))?.value;
    if (!outlet) throw new AppError("DEVICE_NOT_ACTIVATED");
    const shift = await getOpenShift(db);
    if (!shift) throw new AppError("NO_OPEN_SHIFT");

    const rates = { serviceBps: outlet.serviceBps, taxBps: outlet.taxBps }; // snapshot (ADR-011)
    const now = deps.now();
    const priced = input.lines.map((l) => ({ ...l, modifiersTotal: l.modifiers.reduce((s, m) => s + m.price, 0) }));
    // Promotions are decided now, at payment, in outlet time (ADR-016).
    const applied = applyPromotions(
      priced.map((l) => ({ productId: l.productId, categoryId: l.categoryId, unitPrice: l.unitPrice, modifiersTotal: l.modifiersTotal, quantity: l.quantity, manualDiscount: l.discount ?? null })),
      await db.promotions.toArray(),
      localMoment(now, outlet.timezone),
    );
    const totals = calculate(
      priced.map((l, i) => ({ unitPrice: l.unitPrice, modifiersTotal: l.modifiersTotal, quantity: l.quantity, discount: applied[i]!.discount })),
      input.discount,
      rates,
    );

    const methods = await db.paymentMethods.bulkGet(input.payments.map((p) => p.paymentMethodId));
    const tendered = input.payments.map((p, i) => {
      const method = methods[i];
      if (!method) throw new AppError("UNKNOWN_PAYMENT_METHOD");
      return { ...p, method };
    });
    const settlement = settle(totals.total, tendered.map((p) => ({ methodType: p.method.type, amount: p.amount })));
    if (!settlement.ok) throw new AppError(settlement.reason);

    const createdAt = now.toISOString();
    const date = businessDate(now, outlet.timezone, outlet.businessDayCutoff);
    const counter = nextReceiptCounter(await readState(db, "receiptCounter"), date);
    await writeState(db, "receiptCounter", counter);

    const order: OrderRow = {
      id: deps.newId(),
      shiftId: shift.id,
      receiptNo: formatReceiptNo({ outletCode: outlet.outletCode, deviceCode: outlet.deviceCode, businessDate: date, seq: counter.seq }),
      cashierId: input.cashier.id,
      cashierName: input.cashier.name,
      businessDate: date,
      orderType: input.orderType ?? "take_away",
      tableLabel: input.tableLabel ?? null,
      lines: input.lines.map((l, i) => ({
        id: deps.newId(),
        productId: l.productId,
        productName: l.name,
        categoryName: l.categoryName,
        unitPrice: l.unitPrice,
        quantity: l.quantity,
        notes: l.note,
        modifiers: l.modifiers.map((m) => ({ modifierOptionId: m.optionId, name: m.name, price: m.price })),
        discount: applied[i]!.discount,
        promotion: applied[i]!.promotion,
      })),
      discount: input.discount,
      rates,
      ...totals,
      paidAmount: settlement.paidAmount,
      changeAmount: settlement.changeAmount,
      status: "paid",
      syncStatus: "pending",
      flags: [],
      createdAt,
    };
    const payments: PaymentRow[] = tendered.map((p) => ({
      id: deps.newId(),
      orderId: order.id,
      paymentMethodId: p.method.id,
      methodType: p.method.type,
      methodName: p.method.name,
      amount: p.amount,
      reference: p.reference ?? null,
      createdAt,
    }));

    await db.orders.add(order);
    await db.payments.bulkAdd(payments);
    await enqueueEvent(db, {
      id: deps.newId(),
      type: "order.placed",
      aggregateId: order.id,
      occurredAt: createdAt,
      payload: toOrderPlacedPayload(order, payments),
    });
    return order;
  });
}

function toOrderPlacedPayload(order: OrderRow, payments: PaymentRow[]) {
  return {
    shift_id: order.shiftId,
    receipt_no: order.receiptNo,
    cashier_id: order.cashierId,
    order_type: order.orderType,
    table_label: order.tableLabel ?? null,
    lines: order.lines.map((l) => ({
      id: l.id,
      product_id: l.productId,
      product_name: l.productName,
      category_name: l.categoryName,
      unit_price: l.unitPrice,
      quantity: l.quantity,
      notes: l.notes,
      modifiers: l.modifiers.map((m) => ({ modifier_option_id: m.modifierOptionId, name: m.name, price: m.price })),
      discount: l.discount ?? null,
      promotion: l.promotion ?? null,
    })),
    discount: order.discount,
    rates: { service_bps: order.rates.serviceBps, tax_bps: order.rates.taxBps },
    totals: {
      subtotal: order.subtotal,
      discount_amount: order.discountAmount,
      service_charge: order.serviceCharge,
      tax: order.tax,
      total: order.total,
    },
    payments: payments.map((p) => ({
      id: p.id,
      payment_method_id: p.paymentMethodId,
      method_type: p.methodType,
      amount: p.amount,
      reference: p.reference,
    })),
    change_amount: order.changeAmount,
  };
}
