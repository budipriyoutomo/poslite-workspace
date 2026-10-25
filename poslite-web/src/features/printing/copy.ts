// UI text for printer settings (Bahasa Indonesia).
export const copy = {
  titles: { receipt: "Printer Struk", kitchen: "Printer Dapur", bar: "Printer Bar" },
  stationHint: "Tiket berisi menu dari kategori yang peran cetaknya diatur di back-office (Menu → Kategori).",
  connection: "Koneksi",
  paperWidth: "Lebar kertas",
  paired: "Printer terhubung",
  notPaired: "Belum ada printer",
  pair: "Hubungkan printer",
  pairHint: "Bluetooth: pair printer di pengaturan Bluetooth tablet/PC dulu, lalu pilih di daftar.",
  printerAddress: "Alamat printer",
  bridgeUrl: "Alamat Print Bridge",
  bridgeToken: "Token Print Bridge",
  pairingCode: "Kode pairing",
  pairBridge: "Pasangkan",
  bridgePaired: "Terpasang dengan Print Bridge",
  pairErrors: { INVALID_CODE: "Kode salah atau sudah berganti", PAIRING_LOCKED: "Terlalu banyak kode salah, tunggu 5 menit", BRIDGE_UNREACHABLE: "Print Bridge tidak terjangkau dari perangkat ini" } as Record<string, string>,
  saveAddress: "Simpan alamat",
  addressSaved: "Alamat printer tersimpan",
  eposHint: "IP printer Epson (cek di struk status printer). Buka https://<IP printer> sekali di perangkat ini dan terima sertifikatnya.",
  bridgeHint: "Print Bridge berjalan di PC kasir/mini PC. Di PC yang sama pakai http://localhost:9180; dari tablet perlu alamat HTTPS bridge.",
  testPrint: "Test print",
  testPrintSent: "Test print terkirim — cek hasilnya di kertas.",
  noWebSerial: "Browser ini tidak mendukung printer Bluetooth/USB langsung. Pakai Chrome di Android atau Chrome/Edge di Windows, atau tetap pakai dialog cetak sistem.",
  errors: {
    PRINTER_NOT_PAIRED: "Printer belum dihubungkan — tekan “Hubungkan printer”.",
    PRINTER_UNSUPPORTED: "Browser ini tidak bisa memakai koneksi printer ini.",
    PRINTER_ADDRESS_REQUIRED: "Isi alamat printer (dan alamat + token Print Bridge) lalu simpan.",
    PRINTER_NOT_WRITABLE: "Perangkat ini bukan printer yang bisa dicetak — pilih perangkat lain.",
    PRINTER_UNREACHABLE: "Printer LAN tidak bisa dihubungi — cek IP, kabel/Wi-Fi, dan sertifikat HTTPS printer.",
    PRINTER_REFUSED: "Printer menolak cetakan — cek kertas dan tutup printer.",
    PRINTER_TIMEOUT: "Printer LAN tidak menjawab — pastikan printer menyala.",
    PRINTER_NOT_ALLOWED: "Print Bridge tidak mengizinkan alamat printer ini (hanya jaringan lokal / daftar izin).",
    BRIDGE_UNREACHABLE: "Print Bridge tidak bisa dihubungi — pastikan aplikasinya berjalan dan alamatnya benar.",
    BRIDGE_UNAUTHORIZED: "Token Print Bridge salah.",
    PRINTER_NOT_CONNECTED: "Printer tidak merespons — pastikan printer menyala dan dekat, lalu coba lagi.",
    other: "Printer tidak merespons — pastikan printer menyala dan dekat, lalu coba lagi.",
  },
} as const;

/** Error code thrown by the printing layer → message for the cashier. */
export function printerErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message.split(":")[0]! : ""; // "PRINTER_REFUSED: EPTR_COVER_OPEN"
  return code in copy.errors ? copy.errors[code as keyof typeof copy.errors] : copy.errors.other;
}
