import { formatRupiah } from "@/shared/money";

/** One line of a blind-close count (15 · UX-02); coins have a total but no pieces. */
export interface DenominationRow {
  label: string;
  pieces: number | null;
  amount: number;
}

/** "1" holds the coins' total in Rupiah (07 API contract, shift.closed). */
const COINS = 1;

/** The count a cashier sent, largest note first and coins last; empty denominations left out. */
export function denominationRows(denominations: Record<string, number>): DenominationRow[] {
  return Object.entries(denominations)
    .map(([value, pieces]) => [Number(value), pieces] as const)
    .filter(([, pieces]) => pieces > 0)
    .sort(([a], [b]) => b - a)
    .map(([value, pieces]) =>
      value === COINS ? { label: "Koin", pieces: null, amount: pieces } : { label: formatRupiah(value), pieces, amount: value * pieces },
    );
}
