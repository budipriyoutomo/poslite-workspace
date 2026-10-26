/** Why sent items leave an open bill (15 · UX-05); recorded as the reason text of bill.item_voided. */
export const BILL_VOID_REASONS = ["Tamu batal/pergi", "Salah input", "Menu habis", "Kualitas/komplain", "Lainnya"] as const;
export type BillVoidReason = (typeof BILL_VOID_REASONS)[number];
