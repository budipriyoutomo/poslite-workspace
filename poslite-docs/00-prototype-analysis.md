# 00 — Analisis Prototype

Repo: `budipriyoutomo/maharasa-pos` (branch `main`, hasil v0.app).

## Fitur yang Sudah Ada (UI)

| Area | Fitur | Lokasi |
|---|---|---|
| Auth | Login PIN 4 digit (numpad), logout | `app/page.tsx` |
| Katalog | Grid produk, filter kategori (Semua/Makanan/Minuman), gambar | `app/page.tsx` |
| Cart | Tambah item, +/- qty, edit item (add-on multi-select + catatan), responsive (sidebar desktop, drawer mobile + FAB) | `app/page.tsx` |
| Diskon | Preset persen (5/10/15/20%) & nominal (5K/10K/25K/50K), level transaksi | `app/page.tsx` |
| Pembayaran | Kategori: Cash, Debit, QRIS, Credit Card, Voucher; numpad cash, quick denomination, kembalian | `app/page.tsx` |
| Laporan | Total pendapatan, jumlah transaksi, total diskon, per kategori, per metode bayar, per menu | `app/page.tsx` |
| API client | `ApiService` (login PIN, products, transactions, reports, payment-methods) — **belum dipakai** oleh UI | `lib/api.ts`, `hooks/use-api.ts` |

Semua data masih **mock** di dalam komponen.

## Temuan & Masalah

### 🔴 Harus dibereskan sebelum develop

1. **Campuran Next.js + Nuxt/Vue** — `nuxt.config.ts`, `app/app.vue`, `app/pages/index.vue`, `app/store/cart.ts` (Pinia), dan dependency `vue`, `pinia`, `vite`, `less`, `stylus`, `sass`, dll. → **hapus semua**; pilih satu framework (Next.js).
2. **`typescript.ignoreBuildErrors: true`** di `next.config.mjs` → matikan, aktifkan `strict`.
3. **God component** — `page.tsx` 1.354 baris, ±20 `useState`, 3 layar (login/POS/laporan) dalam satu file. Harus dipecah per feature + route.
4. **Uang pakai `parseFloat`** dan tombol `"."` di numpad cash → Rupiah tidak pakai desimal; pakai integer.
5. **Tidak ada persistence** — refresh = cart & transaksi hilang. Tidak ada service worker/manifest → belum PWA.
6. **Token di `localStorage`** tanpa strategi offline auth; PIN divalidasi di client dengan konstanta (`MOCK_PIN`).
7. **ID transaksi `transactions.length + 1`** → pasti bentrok antar-device. Ganti ULID dibuat di client.
8. **`alert()`** untuk feedback → ganti toast (`sonner` sudah ada di deps).
9. Bug kecil: `processPayment` memanggil `setDiscountValue` yang tidak didefinisikan.

### 🟡 Gap fungsional (belum ada di prototype)

- Cetak struk (printer) & kitchen ticket
- Shift / sesi kasir (buka kasir dengan modal awal, tutup kasir dengan rekap setoran)
- Void / refund
- Nomor struk yang human-readable
- Pajak (PB1) & service charge
- Split payment (bayar sebagian cash, sebagian QRIS)
- Diskon per item (sekarang hanya per transaksi)
- Pengaturan printer & device
- Indikator status online/offline + antrian sync

### 🟢 Yang layak dipertahankan

- Desain UI & flow kasir (login PIN → katalog → cart → bayar) sudah tepat untuk tablet.
- shadcn/ui + Tailwind v4 + lucide-react.
- Model data cart (`selected_add_ons`, `notes`) — tinggal dinormalisasi (lihat [06](./06-domain-and-database.md)).
- Kategori metode bayar (cash/debit/qris/credit card/voucher) → jadi master data `payment_methods` dengan `type`.

## Langkah Migrasi dari Prototype

1. Buat repo baru `poslite-web` (jangan lanjut di repo v0 — v0 akan terus overwrite).
2. Copy `components/ui/*`, `lib/utils.ts`, `globals.css`, lalu pecah `page.tsx` ke `features/*` sesuai [02](./02-frontend-architecture.md).
3. Pindahkan kalkulasi (subtotal, diskon, total, kembalian) ke `domain/` sebagai pure function + unit test **sebelum** dipakai UI.
4. Ganti mock data dengan repository Dexie; seed dari API saat device pertama kali login.
