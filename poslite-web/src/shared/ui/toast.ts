import { type ExternalToast, toast as sonner } from "sonner";

type Message = Parameters<typeof sonner.success>[0];

/**
 * The app's toasts (15 · UX-07): a success confirms briefly and gets out of the way; an error stays
 * until the cashier closes it, so it is never missed during a rush. Import this, not "sonner".
 */
export const toast = {
  success: (message: Message, options?: ExternalToast) => sonner.success(message, { duration: 2_000, ...options }),
  error: (message: Message, options?: ExternalToast) => sonner.error(message, { duration: Infinity, closeButton: true, ...options }),
};
