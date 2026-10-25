// UI text for the auth feature (Bahasa Indonesia; one place per feature for future i18n).
export const copy = {
  title: "POSLite",
  pickCashier: "Pilih nama Anda",
  enterPin: (name: string) => `Halo ${name}, masukkan PIN`,
  pinProgress: (entered: number, total: number) => `${entered} dari ${total} digit`,
  deleteDigit: "Hapus",
  back: "Ganti kasir",
  checking: "Memeriksa PIN…",
  roles: { owner: "Pemilik", manager: "Manajer", cashier: "Kasir", waiter: "Pelayan" },
  errors: {
    WRONG_PIN: "PIN salah",
    UNKNOWN_USER: "Kasir tidak ditemukan di perangkat ini",
    PIN_LOCKED: (until: string) => `Terlalu banyak PIN salah. Coba lagi pukul ${until}`,
  },
  demoHint: "Demo: Siti 1234 · Budi 9999",
  demoBanner: "MODE DEMO: transaksi TIDAK tersimpan ke server dan tidak masuk laporan owner",
  exitDemo: "Keluar dari demo",
  exitDemoTitle: "Keluar dari mode demo?",
  exitDemoHint: "Semua data demo di perangkat ini dihapus, lalu perangkat meminta aktivasi oleh manajer.",
  exitDemoConfirm: "Ya, keluar",
  stayInDemo: "Batal",
  lock: "Kunci",
} as const;
