# 12 — UI Responsive & Modern (HP, Tablet, Desktop)

Rencana kerja untuk membuat UI POSLite nyaman dipakai di HP dan tablet, lebih modern, dan konsisten. Prioritas utama adalah **poslite-web** (kasir); back-office (`poslite-admin`) dan konsol operator (`poslite-operator`) sudah punya sidebar drawer mobile sehingga hanya perlu dipoles.

## Kondisi Awal (2026-10-18)

- Navigasi kasir berisi 7 menu berderet di header (`src/app/(pos)/pos-shell.tsx`) tanpa versi mobile, sehingga meluber di HP.
- Warna ditulis langsung (`bg-white`, `bg-slate-*`, `emerald-*`, `amber-*`, `red-*`) di ±22 file, padahal token tema sudah ada di `globals.css`. Dark mode tidak jalan dan tampilan sulit dijaga konsisten.
- Hampir semua layout hanya memakai breakpoint `lg:`; tablet portrait (768px) masih mendapat layout HP.
- Halaman bayar menumpuk ringkasan dan panel bayar di HP sehingga tombol bayar jauh di bawah.
- `viewport`/`themeColor` belum diatur; safe-area (notch/home bar) belum ditangani; manifest PWA mengunci `orientation: "landscape"`.
- Tombol shadcn default `h-8` (32px), di bawah target sentuh minimum 44px.

## Breakpoint Target

| Kelas perangkat | Lebar | Tailwind | Layout dasar |
|---|---|---|---|
| HP | < 640px | (default) | Satu kolom, bottom navigation, sheet dari bawah |
| Tablet portrait | 640–1023px | `sm:` / `md:` | Dua kolom ringkas, rail navigasi ikon |
| Tablet landscape / desktop | ≥ 1024px | `lg:` / `xl:` | Dua kolom penuh, panel keranjang tetap |

Target sentuh: pada perangkat sentuh (`pointer: coarse`) tombol dan kontrol minimal 44px; pada mouse tetap ringkas.

## Aturan Warna

- Permukaan terang memakai token: `bg-card`, `bg-background`, `bg-muted`, `text-muted-foreground`, `border-border`.
- Aksi utama dan status positif: `primary` / `success`. Peringatan: `warning`. Error dan nilai negatif: `destructive`.
- Varian lembut memakai opacity token, mis. `bg-success/10 text-success`, `bg-warning/10 text-warning`.
- Pengecualian yang memang tetap putih/hitam: QR code (`QrCode.tsx`) dan pratinjau struk (`ReceiptPreview.tsx`), karena merepresentasikan kertas.
- Permukaan yang sengaja gelap di kedua mode (lock screen, aktivasi, PinPad, header kasir) dibiarkan sampai dirombak di Fase 1.

## TODO

### Fase 0 — Fondasi (design system)
- [x] Tetapkan breakpoint target (tabel di atas)
- [x] Tambah token semantik `success` & `warning` (light + dark) di `globals.css`
- [x] Ganti warna hardcoded di permukaan terang ke token tema
- [x] `export const viewport` (themeColor light/dark, `viewportFit: "cover"`) + utilitas safe-area
- [x] Manifest PWA: `orientation: "any"` agar bisa portrait di HP (mengganti keputusan `landscape` di 02 & 08)
- [x] Target sentuh 44px di perangkat sentuh (`pointer-coarse:` pada `Button` dan `Input`)
- [x] Dark mode via `next-themes` (`ThemeProvider`) + tombol ganti tema
- [x] Angka uang memakai `tabular-nums` secara konsisten

### Fase 1 — Shell & navigasi kasir (prioritas tertinggi)
- [x] HP (< `md`, 768px): bottom navigation 4 menu utama (Jual, Bill, Riwayat, Shift) + "Lainnya" (Laporan, Sync, Printer) dalam sheet
- [x] Tablet (`md`–`xl`): rail kiri ikon + label kecil di bawahnya; ≥1280px (`xl`) ikon dan label sebaris. Laporan/Sync/Printer di bagian bawah rail
- [x] Header ringkas (`pos-header.tsx`): logo, Online jadi titik di HP (Offline selalu berupa teks), badge Sync, tombol tema, nama kasir (≥`lg`), Kunci tetap satu ketukan
- [x] Banner offline di bawah header saat koneksi putus

### Fase 2 — Layar Jual
- [x] Tablet (≥ `md`): panel keranjang tetap di kanan (`w-80`, `lg:w-96`); grid produk `auto-fill` minmax 9.5rem sehingga kolom mengikuti lebar area
- [x] HP: bar "Lihat pesanan" (`sell/cart-bar.tsx`) di atas bottom nav, muncul saat ada item; keranjang sebagai drawer dari bawah (88dvh)
- [x] Chip kategori digeser horizontal; kolom cari & chip tetap di atas (hanya grid yang scroll). Cari di samping chip hanya bila area grid ≥ 576px (container query `@xl`)
- [x] Kartu produk: badge jumlah di pesanan + border aktif, harga menonjol, `ProductGridSkeleton`, empty state (menu kosong / pencarian tanpa hasil + "Hapus pencarian")
- [x] Feedback saat produk ditambah: badge "pop", getar 10ms (`navigator.vibrate`) bila didukung
- [x] `LineEditorDialog` jadi bottom sheet di HP via prop baru `DialogContent mobileSheet` (dipakai ulang di Fase 3)

### Fase 3 — Checkout & pembayaran
- [x] < `lg`: rincian pesanan dilipat jadi satu baris ringkasan (`OrderReview`), panel bayar langsung terlihat. Di semua ukuran, ringkasan kembalian + tombol Pisah/Selesaikan menempel di bawah layar
- [x] `MoneyKeypad` `h-14` di perangkat sentuh bila tinggi layar > 760px; nominal cepat 2 kolom di panel sempit (container query); nama metode bayar boleh dua baris
- [x] Dialog QRIS, Diskon, Diskon item, Meja, Void, Refund, Tutup shift, Kas masuk/keluar jadi bottom sheet di HP (`mobileSheet`). Split per item & promo sudah inline, tidak perlu dialog
- [x] `OrderPlacedDialog`: kembalian besar + total/dibayar, tombol Cetak & Pesanan Baru di atas pratinjau struk, fokus otomatis ke Pesanan Baru (Enter = pesanan baru)

### Fase 4 — Layar lainnya
- [x] Bills: empty state ber-ikon (`shared/ui/empty-state.tsx`, dipakai juga di grid produk & Riwayat); kartu bill sudah grid 1/2/3 kolom; TablePicker jadi bottom sheet (Fase 3)
- [x] Riwayat: cari no. struk di atas daftar; ≥ `md` daftar + struk berdampingan, di HP struk (cetak ulang, void, refund) terbuka sebagai bottom sheet (`useMediaQuery`, agar struk hanya dirender sekali)
- [x] Shift, Laporan, Sync, Printer: dicek di HP & tablet, sudah satu kolom/grid 2 kolom — tidak perlu diubah
- [x] Lock / PinPad: varian `short:` (tinggi ≤ 500px) — HP landscape menampilkan logo kiri + PIN pad kanan tanpa scroll. Activation (sekali pakai) cukup bisa di-scroll

### Fase 5 — Admin & Operator (polish)
- [x] Tabel: semua tabel admin & operator di dalam `TableFrame` (`shared/ui/table-frame.tsx`) — scroll horizontal, header tidak terlipat
- [x] Form: grid 1 kolom di HP (field pendek tetap 2 kolom), hari promo & baris input "Tambah" boleh turun baris, header halaman bertumpuk di HP, input/select lebar tetap jadi penuh di HP. `EditDialog` jadi bottom sheet di HP (`mobileSheet`)
- [x] Admin & operator: `bg-white`/`bg-slate-*`/`text-red-*`/`bg-red-50` → token (`bg-card`, `bg-muted`, `text-destructive`). Sidebar gelap operator & tile dashboard berwarna sengaja dipertahankan; admin/operator belum punya tombol dark mode

### Fase 6 — QA
- [x] Project Playwright kasir: `chromium` (desktop), `tablet` (Galaxy Tab S9 landscape), `phone` (Pixel 7) dan `tablet-portrait` (iPad Pro 11, Chromium). Langkah khusus HP ada di `tests/e2e/layout.ts` (buka drawer pesanan, tutup sheet, buka rincian checkout) — di layar lain tidak melakukan apa-apa
- [x] Temuan dari e2e HP/tablet portrait yang diperbaiki di aplikasi: nama kasir selalu terlihat di header; rincian checkout hanya dilipat di HP (< `md`) agar tombol Diskon terlihat di tablet; drawer pesanan menutup sendiri saat keranjang kosong (setelah simpan bill); panel pesanan dirender di satu tempat saja (`useMediaQuery`)
- [x] Kontras WCAG AA (≥ 4,5) semua pasangan token, light & dark — `destructive` digeser (light `oklch(0.54 0.21 27)`, dark `oklch(0.8 0.14 22)`) dan tombol varian destructive memakai latar `/10` di dark mode. Diterapkan di kasir, admin & operator
- [x] a11y: label tombol tutup dialog/sheet "Close" → "Tutup" (bahasa halaman `id`); navigasi punya `aria-label`, `aria-current` untuk layar aktif, "Lainnya" dengan `aria-haspopup`; fokus otomatis ke "Pesanan Baru" setelah bayar
- [x] Typecheck, lint & unit test lolos (kasir 97 file/572 test, admin 147, operator 58); e2e kasir 28/28 (7 alur × 4 project), admin 4/4, operator 2/2
- [ ] Uji manual PWA terpasang (lihat checklist di bawah)

### Checklist uji manual PWA (perangkat asli)

Pasang dari Chrome (Android) / Safari "Add to Home Screen" (iPad/iPhone), lalu cek:

1. **HP portrait**: aplikasi tidak dipaksa miring; header tidak tertutup notch; bottom nav tidak tertutup home bar/gesture bar.
2. **HP landscape**: layar PIN muat tanpa scroll (logo kiri, PIN pad kanan); layar Jual tetap bisa dipakai.
3. **Tablet portrait & landscape**: rail kiri, panel pesanan di kanan; memutar tablet tidak menghapus keranjang.
4. **Alur kasir di HP**: tambah produk (badge jumlah + getar singkat), "Lihat pesanan" → Bayar → nominal cepat → Selesaikan → "Pesanan Baru".
5. **Dine-in di HP**: tambah item → Lihat pesanan → Makan di tempat → pilih meja → Simpan bill (drawer menutup sendiri).
6. **Riwayat di HP**: ketuk transaksi → struk muncul dari bawah → Cetak Ulang / Void / Refund.
7. **Offline**: mode pesawat → banner kuning "Sedang offline" muncul; transaksi tetap bisa dibayar.
8. **Dark mode**: tombol bulan/matahari di header; semua layar terbaca, termasuk dialog dan struk (struk tetap putih).
9. **Sentuh**: tombol, chip kategori dan keypad nyaman diketuk (≥ 44px), tidak ada zoom saat double-tap.
