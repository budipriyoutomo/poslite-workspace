import { type CartLine, kitchenPending } from "@/features/cart";
import { type KitchenOrder, printKitchenTickets } from "@/features/printing";

/**
 * After a payment: the paid lines the kitchen/bar have not seen yet go out under the receipt number
 * (a take-away order, or bill items added and paid without saving the bill). Never throws.
 */
export async function sendPaidToKitchen(
  input: { order: { id: string; receiptNo: string }; lines: CartLine[]; tableLabel: string | null; cashierName: string },
  print: (order: KitchenOrder) => Promise<{ sentKeys: string[]; hasFailed: boolean }> = printKitchenTickets,
): Promise<{ hasFailed: boolean }> {
  const pending = kitchenPending(input.lines);
  if (pending.length === 0) return { hasFailed: false };
  const { hasFailed } = await print({
    refId: input.order.id,
    reference: input.order.receiptNo,
    tableLabel: input.tableLabel,
    cashierName: input.cashierName,
    isAddition: input.lines.some((l) => (l.sentQuantity ?? 0) > 0),
    lines: pending,
  });
  return { hasFailed };
}
