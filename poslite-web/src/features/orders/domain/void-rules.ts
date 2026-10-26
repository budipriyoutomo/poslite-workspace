// Void = cancel a whole order while its shift is still open on this device (ADR-023).

export type VoidBlocker = "ALREADY_VOIDED" | "OTHER_DEVICE" | "SHIFT_CLOSED" | "HAS_REFUND";

export const REASONS = ["Salah input", "Pelanggan batal", "Lainnya"] as const;
export type Reason = (typeof REASONS)[number];

/** Why this order cannot be voided here, or null when it can (anything else is a refund). */
export function voidBlocker(
  order: { status: "paid" | "voided"; deviceId: string; shiftId: string },
  here: { deviceId: string; openShiftId: string | null; refunded: boolean },
): VoidBlocker | null {
  if (order.status === "voided") return "ALREADY_VOIDED";
  if (order.deviceId !== here.deviceId) return "OTHER_DEVICE";
  if (order.shiftId !== here.openShiftId) return "SHIFT_CLOSED";
  if (here.refunded) return "HAS_REFUND";
  return null;
}

/** The reason text to record, or null while it is incomplete ("Lainnya" needs 1–200 chars). */
export function checkReason(reason: string, other: string): string | null {
  if (reason !== "Lainnya") return reason;
  const text = other.trim();
  return text.length > 0 && text.length <= 200 ? text : null;
}
