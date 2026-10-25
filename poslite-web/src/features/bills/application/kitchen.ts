import { kitchenPending, markSent, type VoidedLine } from "@/features/cart";
import { type KitchenOrder, printKitchenTickets } from "@/features/printing";
import { getDb, type PosDb } from "@/shared/db";

export interface KitchenDeps {
  db: PosDb;
  printKitchen: (order: KitchenOrder) => Promise<{ sentKeys: string[]; hasFailed: boolean }>;
}

const defaultDeps = (): KitchenDeps => ({ db: getDb(), printKitchen: (order) => printKitchenTickets(order) });

/**
 * Sends a saved bill's new items to the kitchen/bar printers. Lines that printed are marked sent on
 * the bill; a failed station's lines stay unsent and go out with the next save or the payment.
 * Never throws: the bill is already saved.
 */
export async function sendBillToKitchen(input: { billId: string; cashierName: string }, deps: KitchenDeps = defaultDeps()): Promise<{ hasFailed: boolean }> {
  const { db } = deps;
  const bill = await db.openBills.get(input.billId);
  const pending = bill ? kitchenPending(bill.lines) : [];
  if (!bill || pending.length === 0) return { hasFailed: false };
  const { sentKeys, hasFailed } = await deps.printKitchen({
    refId: bill.id,
    reference: `Bill ${bill.tableLabel}`,
    tableLabel: bill.tableLabel,
    cashierName: input.cashierName,
    isAddition: bill.lines.some((l) => (l.sentQuantity ?? 0) > 0),
    lines: pending,
  });
  const quantityOf = new Map(bill.lines.map((l) => [l.key, l.quantity]));
  const sent = Object.fromEntries(sentKeys.map((key) => [key, quantityOf.get(key) ?? 0]));
  await db.transaction("rw", db.openBills, async () => {
    const current = await db.openBills.get(bill.id); // may have been paid or cancelled meanwhile
    // A shared bill keeps sentQuantity on the server, so no other device prints it again (ADR-031).
    if (current)
      await db.openBills.update(bill.id, {
        lines: markSent(current.lines, sent),
        ...(current.origin === "server" && { dirty: true }),
      });
  });
  return { hasFailed };
}

/**
 * Tells the kitchen/bar to stop making items taken off a bill after they were sent (ADR-028).
 * Never throws: the void is already recorded; a failed ticket means telling the cook in person.
 */
export async function sendVoidToKitchen(
  input: { bill: { id: string; tableLabel: string }; voided: VoidedLine[]; cashierName: string; reason: string; approverName: string | null },
  deps: KitchenDeps = defaultDeps(),
): Promise<{ hasFailed: boolean }> {
  if (input.voided.length === 0) return { hasFailed: false };
  const { hasFailed } = await deps.printKitchen({
    refId: input.bill.id,
    reference: `Bill ${input.bill.tableLabel}`,
    tableLabel: input.bill.tableLabel,
    cashierName: input.cashierName,
    isAddition: false,
    cancel: { reason: input.reason, approverName: input.approverName },
    lines: input.voided.map((v) => ({ key: v.key, productId: v.productId, name: v.name, quantity: v.quantity, modifiers: v.modifiers, note: "" })),
  });
  return { hasFailed };
}
