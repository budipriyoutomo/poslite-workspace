# 08 — Roadmap & Testing Strategy

## Fase Development

### Fase 0 — Foundation & Spike (± 1 minggu)
Tujuan: membuktikan 3 risiko teknis terbesar sebelum membangun fitur.

- [x] Repo `poslite-web` (Next.js, TS strict, ESLint boundaries, Vitest, Playwright) & `poslite-api` (FastAPI, uv, pytest, mypy --strict, ruff, import-linter, Alembic, Postgres lokal) dalam satu monorepo dengan satu Makefile di root (`make dev` menjalankan keduanya)
- [x] **Spike PWA**: Serwist configurator mode → app bisa dibuka **offline setelah reload** — lulus otomatis (e2e `tests/e2e/offline.spec.ts`, Chrome desktop & emulasi tablet). Tetap di Next.js; fallback Vite tidak diperlukan (ADR-002). [Hasil](#hasil-spike-fase-0)
  - [ ] Uji manual di perangkat asli: Chrome Android (install ke home screen, mode pesawat, buka ulang) & Chrome/Edge Windows
- [ ] **Spike printer**: test print ESC/POS dari printer yang benar-benar akan dipakai (Web Serial Bluetooth Classic di Android, dan di Windows) — *ditunda sampai printer tersedia*
- [x] **Spike Dexie**: 5.000 order dummy — cek performa query & ukuran storage (`make web-spike-dexie`). [Hasil](#hasil-spike-fase-0)
- [x] CI: lint + typecheck + unit test API & web (workflow terpisah per folder)

### Fase 1 — Core Selling Offline (MVP-1)
- [x] Domain `pricing` (termasuk **PB1 & service charge** dalam bps; fixture `pricing-cases.json` bersama API), `cart`, `receipt-number`, business date, kas shift, pembayaran/kembalian + unit test
- [x] Pecah `page.tsx` prototype → `features/catalog`, `cart`, `checkout`, `auth`, `shift`, `orders`, `reports`, `printing`
- [x] Dexie schema v1, outbox tervalidasi Zod, seed data demo lokal (belum ada backend — `ensureDemoData`)
- [x] PIN lock screen (pilih kasir + PIN, PBKDF2 lokal, lockout), shift open/close + kas masuk/keluar, place order (split payment), riwayat order, reprint
- [ ] Cetak struk: driver **Web Serial** (Bluetooth Classic) — *menunggu spike printer* · [x] System print (`window.print()`, 58 mm) + antrian `printJobs`
- [ ] Fase 1b: driver Web Bluetooth (BLE) & WebUSB
- [x] Laporan shift lokal (pendapatan, transaksi, diskon, per metode bayar / kategori / menu)
- [x] E2E `tests/e2e/sell-offline.spec.ts`: buka shift → offline → jual → bayar → struk → reload offline → order ada di Riwayat (Pending)
- [ ] Uji manual di tablet: reboot tablet dengan data & cart tersimpan; cetak ke printer asli
- **DoD**: kasir bisa buka shift → jual → cetak struk → tutup shift **tanpa internet sama sekali**, data bertahan setelah reboot tablet.

### Fase 2 — Backend & Sync (MVP-2)
- [x] Module **Tenancy** + RLS di semua tabel tenant + test isolasi antar tenant (ADR-013) — role `poslite_app`/`poslite_system`, `make db-setup`
- [x] Module Identity, Organization, Catalog, Payment (CRUD back-office API) — *harga/ketersediaan per outlet & metode bayar per outlet ditunda*
- [x] Aktivasi device + opaque device token (tabel `api_tokens`), layar `/activate` di web
- [x] Delta pull (sequence `sync_version_seq` + trigger serial `assign_sync_version`, ADR-009)
- [x] Push sync: `sync_events` (kunci `(tenant_id, id)`), handler registry, savepoint per event, PlaceOrder/OpenShift/CloseShift/MoveCash — *VoidOrder menunggu fitur void (dijawab `UNSUPPORTED_EVENT_TYPE`)*
- [x] Transactional outbox + relay (arq, `make worker` — butuh Redis) + read model laporan harian, `GET /reports/sales-summary`
- [x] Sync engine di frontend (outbox, backoff, Web Locks, status badge, layar Sync + kirim ulang)
- [x] DoD dibuktikan: `poslite-api/tests/e2e/sync/test_dod_two_devices.py` (2 device × 200 order, push paralel + kirim ulang → 400 order, struk unik) dan `make e2e-fullstack` (browser + API asli: aktivasi → jual offline → online → order di server). Isolasi tenant: test pull/push lintas tenant
- **DoD**: 2 device offline 1 hari, masing-masing 200 transaksi → online → semua masuk server tanpa duplikat, nomor struk unik. Device tenant B tidak pernah menerima data tenant A.

### Fase 3 — Back-office & Reporting
- [x] Signup & onboarding tenant (buat bisnis + owner + outlet pertama), platform admin minimal (list/suspend tenant) — operator dibuat dengan `make platform-admin`, konsol di `/platform`; tenant ditangguhkan = tulis back-office ditolak `TENANT_SUSPENDED`, device tetap bisa push
- [x] Back-office web **`poslite-admin`** (app terpisah, ADR-014, `:3001`): menu (produk/kategori/pilihan), harga & ketersediaan per outlet, user & PIN, metode bayar, outlet (tarif pajak/service dalam bps, struk, cut-off) & perangkat (cabut akses) — *metode bayar per outlet ditunda*
- [x] Reporting read model (harian, menu, kategori, metode bayar, kasir) + projector + `make report-rebuild from= to=`
- [x] Dashboard penjualan (grafik harian + tabel, preset 7/30 hari) + export CSV (`;` + BOM untuk Excel ID) / Excel `.xlsx`
- [x] Kontrak OpenAPI `poslite-api/openapi.json` (`make openapi`, dicek CI) → tipe TS admin (`make admin-types`)
- [x] E2E `make admin-e2e`: owner daftar → menu → harga outlet → kasir + PIN → metode bayar → tarif outlet; operator menangguhkan & mengaktifkan tenant (API asli, DB `poslite_e2e_admin`)
- [x] `make worker` diverifikasi dengan Redis lokal (relay jalan tiap 5 detik). Catatan: Homebrew di macOS 13 gagal memasang Redis; dipakai build dari source
- **DoD**: owner baru bisa daftar dan menyiapkan outlet sampai siap jualan tanpa bantuan developer; laporan penjualan cocok dengan order yang tersinkron; operator bisa menangguhkan tenant.

### Fase 4 — Restaurant Features
- [x] Meja per outlet (back-office "Outlet, Meja & Perangkat" + pull `dining_table`; demo seed punya meja A1–B2)
- [x] Dine-in: open bill lokal device (ADR-015) — pilih meja, simpan, lanjutkan/batalkan di menu **Bill**; shift tidak bisa ditutup bila ada bill terbuka (`OPEN_BILLS`) — *pindah meja belum ada*
- [x] Split bill per item (pilih qty per baris → order & struk sendiri; diskon order nominal hanya bayar sekaligus)
- [x] Split payment (beberapa metode per order) — sudah ada sejak Fase 1 (`PaymentPanel`)
- [x] Diskon per item (manual) + rumus total baru di `pricing-cases.json` (web & API); `order.placed` membawa `table_label`, `discount` & `promotion` per baris (fixture `order-placed-variants.json`)
- [x] Promo otomatis `percent_off` / `buy_x_get_y` (back-office "Promo" + pull `promotion` + evaluasi offline saat bayar, ADR-016); struk menampilkan promo/diskon per baris & meja
- [ ] *Setelah spike printer*: kitchen ticket per printer role (kitchen/bar), Print Bridge untuk printer LAN + driver HTTP Epson ePOS / Star WebPRNT
- [x] E2E: `tests/e2e/dine-in-offline.spec.ts` (bill meja → lanjutkan → pisah per item, offline) dan `make e2e-fullstack` (promo & meja dari back-office → jual offline → total server sama, tanpa flag)
- **DoD**: pelayan membuka bill meja, menambah pesanan beberapa kali, lalu tamu membayar terpisah per item — semuanya offline; promo happy hour terhitung otomatis dan total server sama dengan device (tanpa `TOTAL_MISMATCH`).

### Fase 5 — Scale & Integrasi
- [ ] Port `PaymentGateway` + `FakeGateway` + webhook masuk bertanda tangan (ADR-017) — *adapter Midtrans/Xendit menunggu pilihan vendor*
- [ ] Billing: trial 14 hari, tagihan bulanan per outlet aktif, grace 7 hari, suspend/aktif otomatis (ADR-018); halaman Langganan di back-office, status di konsol platform
- [ ] QRIS dinamis saat online + fallback QRIS statis offline (ADR-019); flag `QRIS_UNPAID`
- [ ] Webhook keluar dari outbox untuk inventory/ERP/RestaurantOps (ADR-020) — inventory **tidak** dibangun di POSLite; halaman Integrasi di back-office
- [ ] *Ditunda*: wrapper native (Capacitor) bila perlu iOS + Bluetooth; e-wallet callback langsung
- **DoD**: tenant trial habis → tagihan terbit → dibayar lewat gateway (fake) → tetap aktif; tidak bayar lewat grace → suspend otomatis, kasir tetap jualan. Order yang dibayar dengan QR dinamis tercatat tanpa flag; order sampai ke endpoint webhook dengan tanda tangan valid.

## Hasil Spike Fase 0

Diukur 2026-09-25 di Chrome 154 (macOS, Intel). Angka tablet = CPU di-throttle 4× via DevTools sebagai pendekatan tablet Android kelas menengah; **bukan** pengganti uji di perangkat asli (I/O flash tablet lebih lambat).

### PWA (Serwist configurator mode)

- `pnpm build` = `next build && serwist build serwist.config.mjs` → `public/sw.js` mem-precache route hasil prerender (`/`) + semua chunk JS/CSS, font, ikon (15 URL, ±633 kB).
- E2E: kunjungan pertama online → SW mengontrol halaman → `context.setOffline(true)` → reload → app shell tampil. Manifest `standalone`/`landscape` dengan ikon 192/512.
- `skipWaiting: false`: versi SW baru menunggu; banner "Versi baru tersedia" + aktivasi hanya saat cart kosong dikerjakan di Fase 1. `reloadOnOnline` dimatikan agar app tidak reload di tengah transaksi.
- Catatan: Playwright 1.63 tidak menyediakan Chromium untuk macOS 13 → jalankan lokal dengan `PW_CHANNEL=chrome` (Chrome terpasang). CI tetap memakai Chromium bawaan.

### Dexie (5.000 order, ±4 baris/order, 200 order/hari, 200 pending + outbox)

| Query | Baris | 1× p50 / p95 (ms) | 4× p50 / p95 (ms) |
|---|---|---|---|
| Riwayat: 50 order terbaru (`orderBy('createdAt').reverse()`) | 50 | 1,3 / 2,3 | 3,1 / 4,8 |
| Cari order via `receiptNo` | 1 | 0,5 / 0,7 | 1,0 / 2,2 |
| Detail order + payments | 2 | 0,8 / 1,7 | 1,8 / 6,5 |
| Laporan shift (index `shiftId`) + sum | 100 | 2,2 / 4,6 | 5,6 / 6,8 |
| Laporan hari ini (range `createdAt`) | 200 | 3,7 / 7,2 | 10,2 / 19,3 |
| Badge sync: count `syncStatus = pending` | 200 | 0,3 / 0,3 | 1,0 / 1,8 |
| Batch push outbox (50, urut `seq`) | 50 | 2,8 / 3,4 | 8,5 / 15,8 |
| **Tulis: place order** (order + payment + outbox + counter, 1 transaksi) | 1 | 1,5 / 2,3 | 6,4 / 9,8 |
| Worst case: scan semua order + agregasi | 5.000 | 128 / 138 | 447 / 651 |

- Seed 5.000 order dalam satu transaksi: 1,0 s (1×) / 1,8 s (4×) — relevan untuk initial sync/restore.
- Storage: ±8,9 MB untuk 5.000 order (±1,8 KB/order; JSON mentah 5,2 MB). Dengan prune 30 hari @200 order/hari (±6.000 order) → ±11 MB, jauh di bawah kuota Chrome.
- **Kesimpulan**: skema v1 di [03](./03-offline-sync.md) layak. Semua query interaktif < 20 ms p95 bahkan di 4×, dan menulis satu transaksi penjualan < 10 ms.
- **Aturan yang dihasilkan**: layar & laporan harus memakai index (`shiftId`, range `createdAt`, `syncStatus`), jangan scan seluruh `orders` (±0,5 detik di 4×, tumbuh linear). Laporan lintas hari yang besar lebih baik memakai ringkasan per shift yang disimpan saat tutup shift.
- Batch outbox saat ini memindai urut `seq` lalu filter status — cepat selama outbox kecil (normal: hanya event yang belum terkirim). Bila outbox bisa besar (offline berhari-hari), pertimbangkan compound index `[status+seq]` saat membuat skema v1 di Fase 1.

## Strategi Testing

### Frontend

| Level | Tool | Target |
|---|---|---|
| Unit | Vitest | 100% `domain/*` (pricing, cart merge, change, receipt no., modifier min/max) |
| Component | Vitest + RTL + user-event | Keypad, cart, payment picker, PIN pad |
| Integration | Vitest + `fake-indexeddb` + MSW | use-case place order → outbox; sync engine (accepted/duplicate/flagged/rejected/network error) |
| E2E | Playwright | Jual offline → online → cek data di API staging; update SW tidak reload saat cart berisi |
| Manual device | Checklist | Printer (lihat [04](./04-printing.md#checklist-pengujian-printer)), reboot tablet, storage penuh |

### Backend

| Level | Tool | Target |
|---|---|---|
| Unit | pytest | Entity & value object sales/shift, PriceCalculator, `div_round_half_up`; use case dengan `FakeUnitOfWork` (tidak commit) |
| Integration | pytest + Postgres lokal (`poslite_test`) | Repository, UoW (savepoint rollback membuang domain event), outbox ditulis di transaksi yang sama & relay idempotent, projector idempotent, trigger `version` naik saat insert/update/soft-delete |
| E2E (HTTP) | pytest + `httpx.AsyncClient` | `/sync/push` idempotency (kirim batch sama 2x), urutan event, `flagged` (TOTAL_MISMATCH, RATES_OUTDATED), `rejected` lalu dikirim ulang → diproses, device revoked, permission void |
| Contract | pytest + fixture JSON bersama | Payload event dari frontend tervalidasi server |
| Tenant isolation | pytest + Postgres (role app, RLS aktif) | Untuk setiap tabel & endpoint: tenant A tidak bisa baca/ubah data tenant B; query tanpa `app.tenant_id` → 0 baris / error; pull & push hanya scope tenant device |
| Concurrency | pytest (asyncio.gather) | 2 request push paralel dari device yang sama → tidak dobel; 2 transaksi master data paralel → version terlihat sesuai urutan commit (pull tidak melewatkan baris) |

### Shared Fixtures

`tests/fixtures/pricing-cases.json` (path sama di `poslite-api/` dan `poslite-web/`) berisi kasus hitung (subtotal, diskon persen/nominal, pembulatan tepat `.5`, service & pajak dalam basis poin). Dipakai oleh Vitest **dan** pytest → hasil perhitungan frontend dan backend dijamin identik.

## Definition of Done (per fitur)

- [ ] Domain logic punya unit test (ditulis dulu — TDD)
- [ ] Berfungsi dalam mode offline (atau secara eksplisit di-disable dengan pesan jelas)
- [ ] Tidak ada `any`, lolos typecheck (tsc / mypy --strict), lint (eslint / ruff)
- [ ] Nominal uang integer end-to-end
- [ ] Aksi sensitif tercatat (siapa, kapan, device mana)
- [ ] Tabel baru punya `tenant_id` + policy RLS, dan ada test isolasi tenant
- [ ] Dokumen di folder ini diperbarui jika ada keputusan baru (tambah ADR di [01](./01-system-architecture.md))
