/** History badge of an order (ADR-023): voided, partly refunded, or fully refunded. */
export function refundBadge(
  order: { status: "paid" | "voided"; lines: { id: string; quantity: number }[] },
  refunds: { lines: { orderLineId: string; quantity: number }[] }[],
): "VOID" | "PARTIAL" | "FULL" | null {
  if (order.status === "voided") return "VOID";
  if (refunds.length === 0) return null;
  const refunded = new Map<string, number>();
  for (const r of refunds) for (const l of r.lines) refunded.set(l.orderLineId, (refunded.get(l.orderLineId) ?? 0) + l.quantity);
  return order.lines.every((l) => (refunded.get(l.id) ?? 0) >= l.quantity) ? "FULL" : "PARTIAL";
}
