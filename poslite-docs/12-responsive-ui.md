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
- [ ] Tabel (`shared/ui/table.tsx`): scroll horizontal atau tampilan kartu di HP
- [ ] Form & dialog edit: satu kolom di HP, tombol aksi menempel di bawah
- [ ] Operator: ganti `bg-slate-100` hardcoded ke token tema

### Fase 6 — QA
- [ ] Project viewport Playwright: iPhone (390), iPad portrait (820), iPad landscape (1180)
- [ ] Cek a11y: kontras, fokus keyboard, `aria-*` pada navigasi baru
- [ ] Uji manual PWA terpasang di Android & iPad (safe-area, orientasi)
- [ ] `make check` & e2e lolos (selector e2e yang bergantung pada nav lama diperbarui)
