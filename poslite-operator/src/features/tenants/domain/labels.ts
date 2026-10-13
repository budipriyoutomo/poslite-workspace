/** Indonesian labels for statuses the API returns as codes. */
const SUBSCRIPTION: Record<string, string> = { trialing: "Masa coba", active: "Aktif", past_due: "Menunggak" };
const INVOICE: Record<string, string> = { open: "Belum dibayar", paid: "Lunas", void: "Dibatalkan" };
const ROLE: Record<string, string> = { owner: "Owner", manager: "Manajer", cashier: "Kasir" };

export const subscriptionLabel = (status: string | null | undefined): string => (status ? (SUBSCRIPTION[status] ?? status) : "—");
export const invoiceLabel = (status: string): string => INVOICE[status] ?? status;
export const roleLabels = (roles: string[]): string => roles.map((r) => ROLE[r] ?? r).join(", ") || "—";

/** "Ditangguhkan · tagihan" when the billing job suspended the tenant, not an operator. */
export const tenantStatusLabel = (status: string, reason: string | null | undefined): string =>
  status === "suspended" ? (reason === "billing" ? "Ditangguhkan · tagihan" : "Ditangguhkan") : "Aktif";

const ERRORS: Record<string, string> = {
  LAST_OWNER: "Owner aktif terakhir tidak bisa dinonaktifkan. Aktifkan atau tambahkan owner lain dulu.",
  USER_HAS_NO_LOGIN: "User ini hanya login dengan PIN, tidak punya password.",
  USER_NOT_FOUND: "User tidak ditemukan di tenant ini.",
  TENANT_NOT_FOUND: "Tenant tidak ditemukan.",
  TRIAL_NOT_ACTIVE: "Tenant sudah tidak dalam masa coba.",
  INVOICE_ALREADY_PAID: "Tagihan sudah lunas.",
  INVOICE_NOT_FOUND: "Tagihan tidak ditemukan.",
};

/** The message for an API error code; otherwise the server's own message. */
export const errorMessage = (code: string | undefined, fallback: string): string => (code && ERRORS[code]) || fallback;
