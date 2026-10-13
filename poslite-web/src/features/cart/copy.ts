// UI text for the cart feature (Bahasa Indonesia).
export const copy = {
  title: "Pesanan",
  empty: "Keranjang kosong",
  emptyHint: "Pilih menu di sebelah kiri",
  increase: (name: string) => `Tambah jumlah ${name}`,
  decrease: (name: string) => `Kurangi jumlah ${name}`,
  quantity: (name: string) => `Jumlah ${name}`,
  edit: (name: string) => `Ubah ${name}`,
  clear: "Kosongkan",
  lineDiscount: (name: string) => `Diskon item ${name}`,
  removeLineDiscount: (name: string) => `Hapus diskon ${name}`,
  lineDiscountTitle: (name: string) => `Diskon untuk ${name}`,
  lineDiscountHint: "Diskon item menggantikan promo pada baris ini.",
} as const;
