import { isManager } from "@/shared/db";
import { AppError } from "@/shared/errors";

import { copy } from "../copy";
import { verifyPin, type VerifyPinDeps } from "./verify-pin";

/** What to tell the user about a failed PIN; the lockout reads the same here and on the lock screen. */
export function pinErrorMessage(error: unknown): string {
  if (!(error instanceof AppError)) return String(error);
  if (error.code === "PIN_LOCKED") {
    const until = new Date(String(error.details.lockedUntil)).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    return copy.errors.PIN_LOCKED(until);
  }
  return copy.errors[error.code as "WRONG_PIN" | "UNKNOWN_USER"] ?? error.code;
}

/**
 * A manager approves on this device, offline (voids, refunds, discounts over the limit, cancelled
 * bills — 15 · UX-05): true, or the message to show. Wrong PINs count toward the device lockout.
 */
export async function checkManagerPin(userId: string, pin: string, deps?: VerifyPinDeps): Promise<true | string> {
  try {
    const user = await verifyPin({ userId, pin }, deps);
    return isManager(user.role) || copy.errors.NOT_MANAGER;
  } catch (e) {
    return pinErrorMessage(e);
  }
}
