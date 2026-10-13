/** Human labels for audit actions (platform_audit_log.action); unknown actions show as-is. */
const LABELS: Record<string, string> = {
  "tenant.suspend": "Menangguhkan tenant",
  "tenant.activate": "Mengaktifkan tenant",
  "subscription.extend_trial": "Memperpanjang trial",
  "invoice.mark_paid": "Menandai tagihan lunas",
  "user.reset_password": "Reset password user",
  "user.deactivate": "Menonaktifkan user",
  "user.activate": "Mengaktifkan user",
  "operator.create": "Menambah operator",
  "operator.disable": "Menonaktifkan operator",
  "operator.enable": "Mengaktifkan operator",
};

export const actionLabel = (action: string): string => LABELS[action] ?? action;

/** One line from the entry's detail: who or what the action was about. */
export function describeDetail(detail: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof detail.name === "string") parts.push(detail.name);
  if (typeof detail.email === "string") parts.push(detail.email);
  if (typeof detail.days === "number") parts.push(`+${detail.days} hari`);
  return parts.join(" · ");
}
