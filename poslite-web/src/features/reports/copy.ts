// UI text for the reports feature (Bahasa Indonesia).
export const copy = {
  noShift: "Belum ada shift.",
  title: (businessDate: string, isClosed: boolean) => `Laporan Shift · ${businessDate}${isClosed ? " (ditutup)" : ""}`,
  // 15 · UX-10: "Pendapatan" read as sales although it held service and PB1.
  totalTaken: "Total diterima",
  netSales: "Penjualan bersih",
  transactions: "Transaksi",
  discount: "Diskon",
  service: "Service",
  tax: "PB1",
  prePaymentVoids: "Void sebelum bayar",
  voidSummary: (count: number, amount: string) => `${count} · ${amount}`,
  byPaymentMethod: "Metode Pembayaran",
  byChannel: "Per Channel",
  byCategory: "Kategori",
  byProduct: "Menu",
} as const;
