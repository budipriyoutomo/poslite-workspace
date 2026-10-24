# 08 — Roadmap & Testing Strategy

## Fase Development

Urutan kerja (keputusan 2026-10-07): Fase 0–5 selesai → **Fase 6 (multi brand + fitur trial non-printer)** → **Fase 7 (printer & uji perangkat asli)**. Item printer yang belum selesai di fase lama dipindah ke Fase 7.

### Fase 0 — Foundation & Spike (± 1 minggu)
Tujuan: membuktikan 3 risiko teknis terbesar sebelum membangun fitur.

- [x] Repo `poslite-web` (Next.js, TS strict, ESLint boundaries, Vitest, Playwright) & `poslite-api` (FastAPI, uv, pytest, mypy --strict, ruff, import-linter, Alembic, Postgres lokal) dalam satu monorepo dengan satu Makefile di root (`make dev` menjalankan keduanya)
- [x] **Spike PWA**: Serwist configurator mode → app bisa dibuka **offline setelah reload** — lulus otomatis (e2e `tests/e2e/offline.spec.ts`, Chrome desktop & emulasi tablet). Tetap di Next.js; fallback Vite tidak diperlukan (ADR-002). [Hasil](#hasil-spike-fase-0)
  - [ ] Uji manual di perangkat asli: Chrome Android (install ke home screen, mode pesawat, buka ulang) & Chrome/Edge Windows → **Fase 7**
- [ ] **Spike printer**: test print ESC/POS dari printer yang benar-benar akan dipakai → **Fase 7**
- [x] **Spike Dexie**: 5.000 order dummy — cek performa query & ukuran storage (`make web-spike-dexie`). [Hasil](#hasil-spike-fase-0)
- [x] CI: lint + typecheck + unit test API & web (workflow terpisah per folder)

### Fase 1 — Core Selling Offline (MVP-1)
- [x] Domain `pricing` (termasuk **PB1 & service charge** dalam bps; fixture `pricing-cases.json` bersama API), `cart`, `receipt-number`, business date, kas shift, pembayaran/kembalian + unit test
- [x] Pecah `page.tsx` prototype → `features/catalog`, `cart`, `checkout`, `auth`, `shift`, `orders`, `reports`, `printing`
- [x] Dexie schema v1, outbox tervalidasi Zod, seed data demo lokal (belum ada backend — `ensureDemoData`)
- [x] PIN lock screen (pilih kasir + PIN, PBKDF2 lokal, lockout), shift open/close + kas masuk/keluar, place order (split payment), riwayat order, reprint
- [x] Cetak struk: System print (`window.print()`, 58 mm) + antrian `printJobs`; driver **Web Serial** (Bluetooth Classic) dibuat di Fase 7 — *belum diuji dengan printer asli*
- [x] Fase 1b: driver Web Bluetooth (BLE) & WebUSB — dibuat di Fase 7, *belum diuji dengan printer asli*
- [x] Laporan shift lokal (pendapatan, transaksi, diskon, per metode bayar / kategori / menu)
- [x] E2E `tests/e2e/sell-offline.spec.ts`: buka shift → offline → jual → bayar → struk → reload offline → order ada di Riwayat (Pending)
- [ ] Uji manual di tablet: reboot tablet dengan data & cart tersimpan; cetak ke printer asli → **Fase 7**
- **DoD**: kasir bisa buka shift → jual → cetak struk → tutup shift **tanpa internet sama sekali**, data bertahan setelah reboot tablet.

### Fase 2 — Backend & Sync (MVP-2)
- [x] Module **Tenancy** + RLS di semua tabel tenant + test isolasi antar tenant (ADR-013) — role `poslite_app`/`poslite_system`, `make db-setup`
- [x] Module Identity, Organization, Catalog, Payment (CRUD back-office API) — *harga/ketersediaan per outlet & metode bayar per outlet ditunda*
- [x] Aktivasi device + opaque device token (tabel `api_tokens`), layar `/activate` di web
- [x] Delta pull (sequence `sync_version_seq` + trigger serial `assign_sync_version`, ADR-009)
- [x] Push sync: `sync_events` (kunci `(tenant_id, id)`), handler registry, savepoint per event, PlaceOrder/OpenShift/CloseShift/MoveCash — *VoidOrder → Fase 6*
- [x] Transactional outbox + relay (arq, `make worker` — butuh Redis) + read model laporan harian, `GET /reports/sales-summary`
- [x] Sync engine di frontend (outbox, backoff, Web Locks, status badge, layar Sync + kirim ulang)
- [x] DoD dibuktikan: `poslite-api/tests/e2e/sync/test_dod_two_devices.py` (2 device × 200 order, push paralel + kirim ulang → 400 order, struk unik) dan `make e2e-fullstack` (browser + API asli: aktivasi → jual offline → online → order di server). Isolasi tenant: test pull/push lintas tenant
- **DoD**: 2 device offline 1 hari, masing-masing 200 transaksi → online → semua masuk server tanpa duplikat, nomor struk unik. Device tenant B tidak pernah menerima data tenant A.

### Fase 3 — Back-office & Reporting
- [x] Signup & onboarding tenant (buat bisnis + owner + outlet pertama), platform admin minimal (list/suspend tenant) — operator dibuat dengan `make platform-admin`, konsol di `/platform` (sejak ADR-025 dipindah ke app `poslite-operator`); tenant ditangguhkan = tulis back-office ditolak `TENANT_SUSPENDED`, device tetap bisa push
- [x] Back-office web **`poslite-admin`** (app terpisah, ADR-014, `:3001`): menu (produk/kategori/pilihan), harga & ketersediaan per outlet, user & PIN, metode bayar, outlet (tarif pajak/service dalam bps, struk, cut-off) & perangkat (cabut akses) — *metode bayar per outlet → Fase 6*
- [x] Reporting read model (harian, menu, kategori, metode bayar, kasir) + projector + `make report-rebuild from= to=`
- [x] Dashboard penjualan (grafik harian + tabel, preset 7/30 hari) + export CSV (`;` + BOM untuk Excel ID) / Excel `.xlsx`
- [x] Kontrak OpenAPI `poslite-api/openapi.json` (`make openapi`, dicek CI) → tipe TS admin (`make admin-types`) dan konsol operator (`make operator-types`)
- [x] E2E `make admin-e2e`: owner daftar → menu → harga outlet → kasir + PIN → metode bayar → tarif outlet (API asli, DB `poslite_e2e_admin`); skenario operator menangguhkan & mengaktifkan tenant kini di `make operator-e2e` (DB `poslite_e2e_operator`)
- [x] `make worker` diverifikasi dengan Redis lokal (relay jalan tiap 5 detik). Catatan: Homebrew di macOS 13 gagal memasang Redis; dipakai build dari source
- **DoD**: owner baru bisa daftar dan menyiapkan outlet sampai siap jualan tanpa bantuan developer; laporan penjualan cocok dengan order yang tersinkron; operator bisa menangguhkan tenant.

### Fase 4 — Restaurant Features
- [x] Meja per outlet (back-office "Outlet, Meja & Perangkat" + pull `dining_table`; demo seed punya meja A1–B2)
- [x] Dine-in: open bill lokal device (ADR-015) — pilih meja, simpan, lanjutkan/batalkan di menu **Bill**; shift tidak bisa ditutup bila ada bill terbuka (`OPEN_BILLS`) — *pindah meja → Fase 6*
- [x] Split bill per item (pilih qty per baris → order & struk sendiri; diskon order nominal hanya bayar sekaligus)
- [x] Split payment (beberapa metode per order) — sudah ada sejak Fase 1 (`PaymentPanel`)
- [x] Diskon per item (manual) + rumus total baru di `pricing-cases.json` (web & API); `order.placed` membawa `table_label`, `discount` & `promotion` per baris (fixture `order-placed-variants.json`)
- [x] Promo `percent_off` / `buy_x_get_y` (back-office "Promo" + pull `promotion` + evaluasi offline saat bayar, ADR-016; sejak 2026-10-12 dipilih kasir di layar bayar, bukan otomatis); struk menampilkan promo/diskon per baris & meja
- [x] Kitchen ticket per printer role (kitchen/bar), Print Bridge untuk printer LAN + driver HTTP Epson ePOS — dibuat di Fase 7; Star WebPRNT masih ditunda
- [x] E2E: `tests/e2e/dine-in-offline.spec.ts` (bill meja → lanjutkan → pisah per item, offline) dan `make e2e-fullstack` (promo & meja dari back-office → jual offline → total server sama, tanpa flag)
- **DoD**: pelayan membuka bill meja, menambah pesanan beberapa kali, lalu tamu membayar terpisah per item — semuanya offline; promo happy hour terhitung otomatis dan total server sama dengan device (tanpa `TOTAL_MISMATCH`).

### Fase 5 — Scale & Integrasi
- [x] Port `PaymentGateway` + `FakeGateway` + webhook masuk bertanda tangan `POST /gateway/webhook` (ADR-017); checkout simulasi `/gateway/fake/pay/{ref}` — *adapter Midtrans/Xendit menunggu pilihan vendor*
- [x] Billing: trial 14 hari, tagihan bulanan per outlet aktif (`PRICE_PER_OUTLET`), grace 7 hari, suspend/aktif otomatis (ADR-018) — job harian di worker + `make billing-run`; halaman **Langganan** di back-office; konsol platform menampilkan status langganan & alasan suspend (`manual`/`billing`)
- [x] QRIS dinamis saat online + fallback QRIS statis offline (ADR-019); `POST/GET /payments/qris`, flag `QRIS_UNPAID`; QR dirender di kasir (`qrcode-generator`, dimuat saat dibutuhkan)
- [x] Webhook keluar dari outbox untuk inventory/ERP/RestaurantOps (ADR-020): `order.placed` (detail lengkap) & `shift.closed`, HMAC-SHA256, retry 8× lalu `dead`, kirim ulang — halaman **Integrasi** di back-office. Inventory **tidak** dibangun di POSLite
- [x] Gambar produk di object storage S3 (ADR-021): `POST /media/images`, DB menyimpan `image_key` saja, URL dirangkai dari `MEDIA_PUBLIC_BASE_URL` (IDCloudHost `is3.cloudhost.id`; `local` untuk dev) — unggah + preview di form produk back-office, POS merangkai URL dari `media_base_url` di pull
- [ ] *Ditunda*: wrapper native (Capacitor) bila perlu iOS + Bluetooth; e-wallet callback langsung
- **DoD**: tenant trial habis → tagihan terbit → dibayar lewat gateway (fake) → tetap aktif; tidak bayar lewat grace → suspend otomatis, kasir tetap jualan. Order yang dibayar dengan QR dinamis tercatat tanpa flag; order sampai ke endpoint webhook dengan tanda tangan valid.

### Fase 6 — Multi Brand & Fitur Trial (non-printer)

Desain: [10](./10-multi-company-brand.md) dan [11](./11-trial-features.md). Urutan di bawah disengaja: multi brand dulu karena mengubah schema inti — sebaiknya selesai **sebelum** data trial pelanggan masuk.

**6a — Perusahaan → Brand → Outlet (ADR-022)**
- [x] Tabel `brands`; `brand_id` di outlets, categories, products, modifier_groups, promotions, shifts, orders, rpt_*; SKU unik per brand; migrasi brand "Utama" (migrasi `0016`, test pada DB berisi data + downgrade)
- [x] `user_assignments` menggantikan `outlet_user` (owner → scope `company`, role lain → scope `outlet`); signup membuat brand pertama
- [x] `AccessScope`; `GET /me/access`; header `X-Brand-Id`; error `BRAND_REQUIRED` / `BRAND_FORBIDDEN` / `OUTLET_FORBIDDEN` / `CROSS_BRAND_REFERENCE` / `COMPANY_SCOPE_REQUIRED` — semua endpoint back-office lama memakai scope; admin mengirim brand pertama dari `/me/access` (pemilih brand → UI back-office)
- [x] CRUD `/brands`, `/users/{id}/assignments`; `POST /outlets` wajib `brand_id`; `LAST_OWNER`
- [x] Pull: `outlet_setting.brand`, katalog & promo per brand, user sesuai assignment; touch `outlets.version` saat brand berubah
- [x] API laporan per perusahaan/brand/outlet (`brand_id`/`outlet_id` opsional); filter brand di webhook (`brand_ids`, data event + `brand_id`)
- [x] Back-office: pemilih brand/outlet, halaman Brand, editor penugasan user, laporan per perusahaan/brand/outlet, filter brand di webhook — e2e `tests/e2e/brands.spec.ts` (owner → brand kedua → outlet → manajer brand → login manajer hanya melihat brand-nya)
- [x] POS: nama/logo brand di lock screen & struk — `outlet_setting.brand` (opsional di Zod) disimpan di setting outlet; struk memakai nama brand bila header kosong (logo di struk menunggu driver printer, Fase 7)
- [x] Test matriks akses + isolasi tenant untuk tabel baru

**6b — Void & Refund (ADR-023)**
- [x] Domain web & API: aturan void, alokasi total ke baris + refund bertahap, rumus kas shift baru; fixture `refund-cases.json`
- [x] Dexie **v5** (`refunds`, `orders.voidedAt`, `syncState.refundCounter` — v4 sudah dipakai ADR-021); event `order.voided` & `order.refunded` (Zod + Pydantic, fixture bersama `correction-events.json`)
- [x] Handler server `VoidOrder` & `RefundOrder` + kode rejected/flag baru; tabel `order_voids`, `refunds`, `refund_lines`, `refund_payments` (migrasi `0017`); permission `order.refund` & `sync.import`
- [x] Laporan: void mengurangi tanggal order, refund dicatat di tanggal refund (kolom refund di `rpt_*`, ringkasan & export); webhook `order.voided` & `order.refunded`
- [x] `GET /orders/{id}`, `GET /orders/lookup?receipt_no=`, `GET /refunds`, `GET /refunds/{id}`
- [x] UI kasir: Void/Refund di Riwayat, approval PIN manajer, badge status, ringkasan tutup shift, cari struk tablet lain (online) — e2e `tests/e2e/corrections-offline.spec.ts`

**6c — Lain-lain**
- [x] Pindah meja open bill (lokal) — langkah di `tests/e2e/dine-in-offline.spec.ts`
- [x] Metode bayar per outlet: `PUT /payment-methods/{id}/outlets`, pull `delete` untuk metode nonaktif, flag `PAYMENT_METHOD_INACTIVE`, matriks di back-office (migrasi `0018`; outlet baru otomatis memakai semua metode)
- [x] Export/import darurat (ADR-024): file export di device (layar Sync, PIN manajer), `POST /imports/device-export` lewat `PushEventsHandler`, tabel `device_imports` (migrasi `0019`), panel import di Outlet, Meja & Perangkat; fixture bersama `device-export.json`
- [x] Kebijakan diskon per brand: preset persen/nominal, boleh nilai bebas, batas kasir (default 20% / Rp 50.000); di atas batas butuh PIN manajer/owner di device, `order.placed` membawa `discount_approved_by`, server memberi flag `DISCOUNT_UNAPPROVED` (migrasi `0020`, fixture bersama `discount-approval-cases.json`, e2e `tests/e2e/discount-offline.spec.ts`)
- [x] Owner aktif terakhir tidak bisa dicabut role-nya, dinonaktifkan, atau dihapus (`LAST_OWNER`)
- [x] Konsol operator SaaS dipisah dari back-office menjadi app **`poslite-operator`** (ADR-025, `:3002`): fitur `auth` (login operator) & `tenants`, CI `operator.yml`, `make dev-operator` / `operator-check` / `operator-e2e` / `operator-types`, `OPERATOR_DOMAIN` di staging
- [x] Fitur konsol operator (ADR-025): ringkasan platform, cari & paginasi tenant, detail tenant, perpanjang trial, tandai tagihan lunas, cari user lintas tenant, reset password & (non)aktifkan user (lewat UoW tenant, `LAST_OWNER` tetap berlaku), kelola akun operator (`disabled_at`), audit log `platform_audit_log` (migrasi `0021`) — 30 test API baru di `tests/e2e/platform_admin/`, `make operator-e2e` (suspend + cari → reset password → perpanjang trial)
- [x] Tutup hari (ADR-026, [13](./13-day-closing.md)): tabel `day_closings` (migrasi `0022`, RLS), `GET /day-closings/day`, `POST /day-closings`, `GET /day-closings`; peringatan `OPEN_SHIFTS` / `DEVICES_NOT_SYNCED` tidak memblok; `changed_since_close` untuk data yang datang belakangan; halaman back-office **Tutup Hari** (cetak lewat dialog browser). Belum: buka ulang tutup hari, webhook `day.closed`, e2e Playwright
- [x] Batal item bill setelah masuk dapur (ADR-028, [14](./14-pilot-readiness.md) P0-1): alasan + PIN manajer saat mengurangi/menghapus unit terkirim atau membatalkan bill, event `bill.item_voided`, tiket BATAL, bayar bill yang mengurangi unit terkirim ditolak; `bill_voids`/`bill_void_lines` (migrasi `0023`, RLS), kolom `pre_payment_void_*` di laporan, export, dan tutup hari, `GET /reports/bill-voids`, webhook; halaman back-office **Batal Sebelum Bayar** (+ CSV). Bukti: `tests/e2e/sync/test_bill_voids.py`, `tests/e2e/bill-void.spec.ts` (4 layout)
- [x] Channel penjualan (ADR-029, [14](./14-pilot-readiness.md) P0-2): `sales_channels`/`channel_prices` (migrasi `0025`, seed Dine In & Take Away), CRUD + daftar harga, entity pull `sales_channel` (Dexie v6), `channel_id`/`external_ref` di `order.placed` + flag `CHANNEL_UNKNOWN`/`EXTERNAL_REF_MISSING`, `orders.channel_id` + backfill + `rpt_daily_channel_sales` (migrasi `0026`), pemilih channel & harga channel di POS, nomor order aplikasi wajib, metode bayar default, struk/tiket `GOFOOD #…`, halaman back-office **Channel Penjualan** + breakdown dashboard. Bukti: `channel-pricing-cases.json` (64 kasus), `tests/e2e/catalog/test_sales_channels.py`, `tests/e2e/sync/test_channel_sales.py`, skenario full-stack GoFood
- [x] Harga sudah termasuk pajak (ADR-030, [14](./14-pilot-readiness.md) P0-3): `brands.price_includes_tax` + `orders.price_includes_tax` (migrasi `0024`), `rates.includes_tax` di `order.placed`, `outlet_setting.price_includes_tax`, hitung mundur di `calculate()`/`PriceCalculator`, struk & ringkasan kasir "Termasuk …", toggle di halaman Brand. Bukti: 19 kasus inklusif di `pricing-cases.json`, `tests/e2e/sync/test_price_includes_tax.py`, skenario full-stack harga inklusif
- [x] Rate limit endpoint publik (ADR-027): signup, login back-office, aktivasi device, login operator — 429 `RATE_LIMITED` + `Retry-After`, Redis di staging (`RATE_LIMIT_BACKEND=redis`), fail open; pesan di ketiga app
- [x] Keamanan dependency (2026-10-18): `next` 16.3.8, `shadcn` CLI ke devDependencies, override `browserslist`/`handlebars`/`sharp`/`source-map-js` di `pnpm-workspace.yaml`; sisa `braces` (tooling lint, belum ada patch)

- DoD dibuktikan: matriks akses & pull per brand (`tests/e2e/organization/`), `make admin-e2e` (`brands.spec.ts`), `make e2e-fullstack` (void + refund offline → server tanpa flag), `tests/e2e/sync/test_corrections.py` (laporan & kas), `test_device_import.py` (file yang sama dua kali → semua `duplicate`, device dicabut tetap bisa diimpor)
- **DoD**: perusahaan dengan 2 brand × 2 outlet; manajer brand A tidak bisa melihat data brand B (API & UI) dan device outlet brand B hanya menerima menu brand B. Kasir mem-void order di shift yang sama, me-refund sebagian order kemarin, dan memindah meja — semuanya offline — lalu sync: laporan & kas shift cocok tanpa flag. Device dicabut aksesnya, file export diimport dua kali tanpa duplikat.

### Fase 7 — Printer & Uji Perangkat Asli

- [ ] Spike printer dengan printer yang akan dipakai (Web Serial Bluetooth Classic di Android & Windows)
- [x] Driver Web Serial (Bluetooth Classic SPP & USB virtual-COM): renderer ESC/POS (`@point-of-sale/receipt-printer-encoder`, dimuat saat cetak pertama; layout sama dengan pratinjau), kirim per chunk 512 byte, sambung ulang + kirim ulang sekali bila printer dimatikan-nyalakan, reconnect tanpa dialog via `getPorts()`; layar **Printer** (koneksi yang didukung browser, kertas 58/80 mm, Hubungkan printer, Test print) — teruji dengan fake driver, *belum diuji dengan printer asli*
- [x] Driver Web Bluetooth (BLE: service printer umum, chunk 20 byte, reconnect via `getDevices()`) & WebUSB (Android; class 7 / bulk OUT) — teruji dengan fake, *belum dengan printer asli*
- [x] Slip void/refund (`void_slip`, `refund_slip`): dicetak otomatis ke printer struk setelah void/refund (gagal cetak hanya toast), berisi oleh/disetujui/alasan, pengingat batalkan non-tunai di EDC, ruang paraf; `printJobs.documentType`; order menyimpan `voidedBy`/`voidApprovedBy` lokal
- [x] Kitchen ticket per printer role (kitchen/bar): peran dari kategori back-office (`print_role`, sudah ada sejak Fase 2), printer dapur/bar per device (tidak dicetak / pakai printer struk / koneksi sendiri), tiket otomatis saat simpan bill (hanya tambahan) & saat bayar; gagal cetak dicoba lagi berikutnya — *tiket batal item & cetak ulang tiket belum*
- [x] Print Bridge printer LAN (app `poslite-print-bridge`, `make dev-bridge` / `bridge-check`, CI `bridge.yml`) + driver HTTP Epson ePOS; layar Printer: isian alamat printer / bridge + token
- [ ] Driver Star WebPRNT (StarPRNT) — ditunda sampai ada printer Star untuk diuji
- [ ] Uji manual di tablet Android & PC Windows: install PWA, mode pesawat, reboot dengan cart tersimpan, [checklist printer](./04-printing.md#checklist-pengujian-printer)
- **DoD**: semua jenis printer yang dipakai tenant trial mencetak struk, slip, dan kitchen ticket; reconnect otomatis setelah printer/tablet restart.

### Menuju Pilot

Pekerjaan setelah Fase 7 — audit batal bill (ADR-028), channel penjualan (ADR-029), harga inklusif pajak (ADR-030), fitur operasional kasir, kesiapan staging, uji beban device, dry run, dan Go/No-Go — direncanakan sebagai **Tahap A–F** di [14 — Rencana Perbaikan Menuju Pilot](./14-pilot-readiness.md). Uji perangkat asli Fase 7 dikerjakan di Tahap D (P1-6).

## Hasil Spike Fase 0

Diukur 2026-09-25 di Chrome 154 (macOS, Intel). Angka tablet = CPU di-throttle 4× via DevTools sebagai pendekatan tablet Android kelas menengah; **bukan** pengganti uji di perangkat asli (I/O flash tablet lebih lambat).

### PWA (Serwist configurator mode)

- `pnpm build` = `next build && serwist build serwist.config.mjs` → `public/sw.js` mem-precache route hasil prerender (`/`) + semua chunk JS/CSS, font, ikon (15 URL, ±633 kB).
- E2E: kunjungan pertama online → SW mengontrol halaman → `context.setOffline(true)` → reload → app shell tampil. Manifest `standalone`, `orientation: "any"`, dengan ikon 192/512.
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
- Batch outbox saat spike memindai urut `seq` lalu filter status. Rekomendasi compound index `[status+seq]` sudah diterapkan di skema v1 ([03](./03-offline-sync.md)), jadi batch push tetap cepat walau device offline berhari-hari.

## Strategi Testing

### Frontend

| Level | Tool | Target |
|---|---|---|
| Unit | Vitest | 100% `domain/*` (pricing, cart merge, change, receipt no., modifier min/max, refund allocation, void rules) |
| Component | Vitest + RTL + user-event | Keypad, cart, payment picker, PIN pad, dialog refund |
| Integration | Vitest + `fake-indexeddb` + MSW | use-case place order / void / refund → outbox; sync engine (accepted/duplicate/flagged/rejected/network error) |
| E2E | Playwright | Jual offline → online → cek data di API staging; update SW tidak reload saat cart berisi; void/refund/pindah meja offline |
| Manual device | Checklist | Printer (lihat [04](./04-printing.md#checklist-pengujian-printer)), reboot tablet, storage penuh |

### Backend

| Level | Tool | Target |
|---|---|---|
| Unit | pytest | Entity & value object sales/shift, PriceCalculator, RefundAllocator, `div_round_half_up`, `AccessScope`; use case dengan `FakeUnitOfWork` (tidak commit) |
| Integration | pytest + Postgres lokal (`poslite_test`) | Repository, UoW (savepoint rollback membuang domain event), outbox ditulis di transaksi yang sama & relay idempotent, projector idempotent, trigger `version` naik saat insert/update/soft-delete, migrasi brand |
| E2E (HTTP) | pytest + `httpx.AsyncClient` | `/sync/push` idempotency (kirim batch sama 2x), urutan event, `flagged` (TOTAL_MISMATCH, RATES_OUTDATED, REFUND_EXCEEDS_ORDER, PAYMENT_METHOD_INACTIVE), `rejected` lalu dikirim ulang → diproses, device revoked, permission void/refund, import darurat |
| Contract | pytest + fixture JSON bersama | Payload event dari frontend tervalidasi server |
| Tenant isolation | pytest + Postgres (role app, RLS aktif) | Untuk setiap tabel & endpoint: tenant A tidak bisa baca/ubah data tenant B; query tanpa `app.tenant_id` → 0 baris / error; pull & push hanya scope tenant device |
| Brand access | pytest | Untuk setiap endpoint back-office: user dengan scope brand/outlet tidak bisa membaca/mengubah brand/outlet lain |
| Concurrency | pytest (asyncio.gather) | 2 request push paralel dari device yang sama → tidak dobel; 2 transaksi master data paralel → version terlihat sesuai urutan commit (pull tidak melewatkan baris) |

### Shared Fixtures

Path sama di `poslite-api/` dan `poslite-web/`, dipakai Vitest **dan** pytest → hasil frontend dan backend dijamin identik:

- `tests/fixtures/pricing-cases.json` — subtotal, diskon persen/nominal, pembulatan tepat `.5`, service & pajak dalam basis poin, diskon baris & promo.
- `tests/fixtures/refund-cases.json` — alokasi total ke baris, refund bertahap (Fase 6).
- `tests/fixtures/sync-events.json`, `order-placed-variants.json` — kontrak payload event.

## Definition of Done (per fitur)

- [ ] Domain logic punya unit test (ditulis dulu — TDD)
- [ ] Berfungsi dalam mode offline (atau secara eksplisit di-disable dengan pesan jelas)
- [ ] Tidak ada `any`, lolos typecheck (tsc / mypy --strict), lint (eslint / ruff)
- [ ] Nominal uang integer end-to-end
- [ ] Aksi sensitif tercatat (siapa, kapan, device mana)
- [ ] Tabel baru punya `tenant_id` + policy RLS, dan ada test isolasi tenant
- [ ] Endpoint back-office baru memakai `AccessScope` dan punya test akses brand/outlet
- [ ] Dokumen di folder ini diperbarui jika ada keputusan baru (tambah ADR di [01](./01-system-architecture.md))