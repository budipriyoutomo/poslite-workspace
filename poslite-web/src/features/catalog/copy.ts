// UI text for the catalog feature (Bahasa Indonesia).
export const copy = {
  all: "Semua",
  search: "Cari menu…",
  empty: "Menu tidak ditemukan",
  unavailable: "Habis",
  note: "Catatan",
  notePlaceholder: "mis. tidak pedas",
  add: "Tambah",
  save: "Simpan",
  groupRule: (min: number, max: number) => (min > 0 ? (max === 1 ? "· wajib pilih 1" : `· pilih ${min}–${max}`) : `· opsional, maks ${max}`),
} as const;
