/** "Rp 12.500" — integer Rupiah with dot thousands separators (same as the POS app). */
export function formatRupiah(amount: number): string {
  const digits = String(Math.abs(Math.trunc(amount))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${amount < 0 ? "-" : ""}Rp ${digits}`;
}
