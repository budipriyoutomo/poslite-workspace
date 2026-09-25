// UI text for the auth feature (Bahasa Indonesia; one place per feature for future i18n).
export const copy = {
  title: "POSLite",
  pickCashier: "Pilih nama Anda",
  enterPin: (name: string) => `Halo ${name}, masukkan PIN`,
  pinProgress: (entered: number, total: number) => `${entered} dari ${total} digit`,
  deleteDigit: "Hapus",
  back: "Ganti kasir",
  checking: "Memeriksa PIN…",
  roles: { owner: "Pemilik", manager: "Manajer", cashier: "Kasir" },
  errors: {
    WRONG_PIN: "PIN salah",
    UNKNOWN_USER: "Kasir tidak ditemukan di perangkat ini",
    PIN_LOCKED: (until: string) => `Terlalu banyak PIN salah. Coba lagi pukul ${until}`,
  },
  demoHint: "Demo: Siti 1234 · Budi 9999",
  lock: "Kunci",
} as const;
