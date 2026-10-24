# 09 — Lingkup Project & Status Pekerjaan

Status per **2026-10-12** (Fase 6 di atas commit `5651f40`). Dokumen ini merangkum *apa yang dibangun POSLite*, *apa yang sengaja tidak*, dan *apa yang sudah selesai*. Detail checklist per fase tetap di [08](./08-roadmap-and-testing.md); keputusan arsitektur di [01](./01-system-architecture.md#architecture-decision-records-adr), [10](./10-multi-company-brand.md), dan [11](./11-trial-features.md).

## Ringkasan

POSLite adalah **SaaS Point of Sales untuk restoran**, multi **perusahaan → brand → outlet**, yang terdiri dari empat aplikasi dalam satu monorepo:

| App | Pengguna | Sifat | Stack |
|---|---|---|---|
| `poslite-web` | Kasir / pelayan di tablet atau PC outlet | PWA **offline-first** | Next.js (SPA ter-prerender) · Serwist · Dexie · Zustand · shadcn/ui |
| `poslite-admin` | Owner / manajer perusahaan, brand, atau outlet | Online, back-office | Next.js · tipe TS dari `openapi.json` |
| `poslite-operator` | Operator SaaS (tim internal POSLite) | Online, konsol internal (ADR-025) | Next.js · tipe TS dari `openapi.json` |
| `poslite-api` | Ketiga app di atas + worker | Modular monolith | Python 3.12 · FastAPI · SQLAlchemy 2.0 async · PostgreSQL (RLS) · Alembic · arq + Redis |

**Posisi saat ini (2026-10-24):** Fase 0–6 selesai secara fungsional di sisi software dan dibuktikan dengan test otomatis — termasuk multi brand dan fitur trial non-printer (void/refund, pindah meja, metode bayar per outlet, export/import darurat, batas diskon kasir per brand). `make check`, `make web-e2e`, `make e2e-fullstack`, `make admin-e2e` dan `make operator-e2e` hijau. Konsol operator SaaS sudah dipisah dari back-office menjadi app `poslite-operator` (ADR-025). **Berikutnya: rencana menuju pilot di [14](./14-pilot-readiness.md) — Tahap A–F, termasuk staging di VPS + Vercel (file & runbook sudah siap di [`deploy/staging`](../deploy/staging/README.md)) dan uji printer & perangkat asli (Fase 7).** Adapter payment gateway sungguhan dan deployment production belum ada.

## Lingkup (Scope)

### Termasuk

1. **Penjualan offline penuh**: buka shift → jual → bayar → struk → tutup shift tanpa internet. Data tersimpan di IndexedDB dan bertahan setelah reload/reboot (ADR-001).
2. **Sinkronisasi** device ↔ server: push event transaksi yang idempotent, delta pull master data, server-wins untuk master data (ADR-003, ADR-004, ADR-009).
3. **Multi-tenant SaaS sejak awal**: satu database, `tenant_id` di semua tabel, isolasi antar perusahaan lewat PostgreSQL Row-Level Security (ADR-013).
4. **Multi brand & multi outlet** *(Fase 6)*: perusahaan → brand → outlet; menu & promo per brand; user ditugaskan ke perusahaan/brand/outlet dan memilih brand/outlet aktif (ADR-022).
5. **Harga & pajak**: integer Rupiah, PB1 & service charge per outlet (bps), diskon order, diskon per item, promo (`percent_off`, `buy_x_get_y`) yang dipilih kasir di layar bayar. *(Fase 6)* Preset diskon dan batas kasir per brand; di atas batas butuh PIN manajer. Rumus yang sama di device & server lewat fixture bersama (ADR-005, ADR-011, ADR-016).
6. **Koreksi transaksi** *(Fase 6)*: void penuh di shift yang sama dan refund penuh/sebagian lintas shift, dengan approval PIN manajer (ADR-023).
7. **Fitur restoran**: meja per outlet, open bill dine-in yang disimpan di device (ADR-015), pindah meja *(Fase 6)*, split bill per item, split payment.
8. **Back-office**: brand, menu (produk, kategori, pilihan/modifier, foto), harga & ketersediaan per outlet, user & penugasan & PIN, metode bayar per outlet, outlet & tarif, meja, perangkat, promo, laporan + export, integrasi webhook, langganan, import data darurat.
9. **Operasional SaaS**: signup perusahaan mandiri, konsol operator (list / suspend / aktifkan tenant), billing langganan per outlet dengan trial, grace, dan suspend otomatis (ADR-018).
10. **Pembayaran**: tunai, metode manual (debit/QRIS statis), dan QRIS dinamis lewat port `PaymentGateway` saat online (ADR-017, ADR-019).
11. **Integrasi keluar**: webhook bertanda tangan HMAC dari outbox (`order.placed`, `shift.closed`, dan di Fase 6 `order.voided`, `order.refunded`, lalu `bill.item_voided` — ADR-028) untuk inventory/ERP (ADR-020).
12. **Keandalan data**: export darurat dari device dan import di back-office lewat jalur push yang sama (ADR-024).
13. **Cetak struk**: abstraksi `PrinterDriver` dan ESC/POS di browser (ADR-007). Saat ini baru driver **System print**; driver lain di Fase 7.

### Tidak termasuk (keputusan produk)

| Di luar lingkup | Alasan / pengganti |
|---|---|
| Inventory / stok | Sistem lain yang mengurus; POSLite mengirim webhook `order.placed` (ADR-020) |
| Open bill tersimpan di server / dibagi antar device, gabung bill | Bill hanya ada di device yang membukanya (ADR-015) |
| Edit order setelah dibayar | Order immutable; koreksi lewat void/refund (ADR-003, ADR-023) |
| Refund otomatis lewat gateway (QRIS dinamis) | Dana non-cash dikembalikan manual di trial |
| Aplikasi native iOS/Android | PWA saja; wrapper Capacitor hanya bila nanti iOS + Bluetooth diperlukan |
| Satu user di banyak perusahaan | Satu email = satu perusahaan; di dalamnya boleh banyak brand/outlet |

## Status per Fase

| Fase | Tujuan | Status | Bukti DoD |
|---|---|---|---|
| 0 — Foundation & Spike | Monorepo, CI, spike PWA & Dexie | ✅ Selesai · spike printer & uji device → Fase 7 | `tests/e2e/offline.spec.ts`, `make web-spike-dexie` ([hasil](./08-roadmap-and-testing.md#hasil-spike-fase-0)) |
| 1 — Core Selling Offline | Jual offline end-to-end | ✅ Selesai · driver printer → Fase 7 | `tests/e2e/sell-offline.spec.ts` |
| 2 — Backend & Sync | API, RLS, push/pull, outbox | ✅ Selesai · VoidOrder → Fase 6 | `tests/e2e/sync/test_dod_two_devices.py`, `make e2e-fullstack` |
| 3 — Back-office & Reporting | Onboarding tenant, admin, laporan | ✅ Selesai | `make admin-e2e` |
| 4 — Restaurant Features | Meja, open bill, split, diskon, promo | ✅ Selesai · pindah meja → Fase 6 · kitchen ticket & LAN → Fase 7 | `tests/e2e/dine-in-offline.spec.ts`, `make e2e-fullstack` |
| 5 — Scale & Integrasi | Gateway, billing, QRIS dinamis, webhook, gambar | ✅ Selesai · ⏳ adapter vendor gateway | e2e Fase 5 (commit `8cdbdbc`) |
| 6 — Multi Brand & Fitur Trial | Brand, akses user, void/refund, pindah meja, bayar per outlet, import darurat | ✅ Selesai ([10](./10-multi-company-brand.md), [11](./11-trial-features.md)) · slip void/refund → Fase 7 | DoD di [08](./08-roadmap-and-testing.md#fase-6--multi-brand--fitur-trial-non-printer) |
| 7 — Printer & Perangkat Asli | Driver printer, slip, kitchen ticket, uji tablet | 🟡 Kode selesai · uji perangkat belum ([14](./14-pilot-readiness.md) P1-6) | DoD di [08](./08-roadmap-and-testing.md#fase-7--printer--uji-perangkat-asli) |

## Yang Sudah Selesai

### POS kasir (`poslite-web`)

| Area | Kemampuan |
|---|---|
| PWA & offline | Service worker Serwist (precache app shell), terbuka offline setelah reload; update SW tidak memaksa reload saat transaksi |
| Penyimpanan lokal | Dexie schema v5 (orders, payments, outbox, shift, openBills, dining tables, promotions, printJobs, refunds, …) |
| Aktivasi | `/activate`: manajer login → pilih outlet → device token; atau **mode demo** tanpa server |
| Auth kasir | Pilih kasir + PIN, verifikasi PBKDF2 lokal, lockout persisten; nama & logo brand di lock screen |
| Shift | Buka/tutup shift, kas masuk/keluar, ringkasan kas; tutup shift diblok bila masih ada open bill |
| Jual | Grid produk + foto (cache offline), modifier min/max, merge baris cart, diskon per item, diskon order dari preset brand; preset di atas batas kasir ditandai dan butuh PIN manajer |
| Promo | Mesin promo offline (`percent_off`, `buy_x_get_y`): layar bayar menampilkan promo yang berlaku + hematnya, kasir memilih |
| Dine-in | Pilih meja, simpan / lanjutkan / batalkan bill, pindah meja, split per item |
| Bayar | Split payment, keypad tunai integer + kembalian, QRIS dinamis (QR + polling) saat online, QRIS statis saat offline |
| Struk | Nomor struk unik per device, business date, system print 58 mm, antrian cetak, reprint; struk menampilkan meja & promo/diskon per baris |
| Riwayat & laporan | Riwayat order + status sync; laporan shift lokal (metode bayar, kategori, menu) |
| Koreksi | Void (shift yang sama) & refund penuh/sebagian (lintas shift) dengan PIN manajer, badge status, cari struk tablet lain saat online |
| Sync | Outbox + backoff + Web Locks, delta pull, badge status, layar Sync + kirim ulang, export darurat (PIN manajer) |

### Back-office (`poslite-admin`)

| Halaman | Isi |
|---|---|
| `/signup`, `/login` | Daftar usaha + owner + brand & outlet pertama; login owner/manajer; pemilih brand aktif |
| Brand | CRUD brand, logo, teks struk, kebijakan diskon (preset, nilai bebas, batas kasir) |
| Dashboard | Grafik penjualan harian, breakdown kategori/menu/kasir/metode bayar, preset 7/30 hari, export CSV & `.xlsx` |
| Menu | Produk (dengan unggah foto + preview), kategori, grup pilihan |
| Harga | Harga & ketersediaan per outlet |
| Users | Kasir dengan PIN, owner/manajer dengan login, penugasan perusahaan/brand/outlet, ganti PIN, nonaktifkan (owner terakhir dijaga) |
| Metode bayar | CRUD metode pembayaran + matriks outlet yang memakainya |
| Outlet, Meja & Perangkat | Pengaturan outlet (tarif pajak/service bps, struk, cut-off), meja, cabut akses tablet, import file export darurat |
| Promo | Promo per brand/outlet, dipilih kasir di layar bayar |
| Integrasi | Endpoint webhook, secret sekali tampil, riwayat pengiriman, kirim ulang |
| Langganan | Status langganan, invoice, link bayar |

### Konsol operator (`poslite-operator`, ADR-025)

| Halaman | Isi |
|---|---|
| Login | Akun operator (operator pertama lewat `make platform-admin`, berikutnya dari halaman Operator); operator nonaktif tidak bisa login |
| `/` Ringkasan | Jumlah tenant aktif/ditangguhkan, trial/berlangganan/menunggak, outlet & perangkat aktif, MRR, total tagihan belum dibayar |
| `/tenants` | Cari (nama, slug, email user), filter status, paginasi, tangguhkan/aktifkan |
| `/tenants/[id]` | Owner, langganan + perpanjang trial, tagihan + tandai lunas, user + reset password (password sementara tampil sekali) & (non)aktifkan, outlet, perangkat, aktivitas operator untuk tenant itu |
| `/users` | Cari user semua tenant berdasarkan nama/email, tautan ke tenant |
| `/operators` | Daftar operator, tambah, nonaktifkan (memutus semua sesinya; tidak bisa diri sendiri), aktifkan |
| `/audit` | Audit log semua aksi operator, paginasi |

### API (`poslite-api`)

Bounded context di `src/poslite/`: `tenancy`, `identity`, `organization`, `catalog`, `promotion`, `payment`, `sales`, `shift`, `sync`, `reporting`, `billing`, `gateway`, `integration`, `platform_admin` (+ `shared`, `tools`, `worker`). Batas antar modul dijaga oleh import-linter.

90 operasi REST di `/api/v1` (termasuk `health`) (lengkap di [07](./07-api-contract.md) dan `poslite-api/openapi.json`):

| Kelompok | Endpoint |
|---|---|
| Auth & tenant | `auth/login`, `auth/logout`, `me/access`, `tenants/signup`, `platform/auth/login`, `platform/me` |
| Konsol operator | `platform/summary`, `platform/tenants` (+ detail, suspend/activate, extend-trial), `platform/invoices/{id}/mark-paid`, `platform/users`, `platform/tenants/{tid}/users/{uid}` (reset-password, (de)activate), `platform/operators` (+ disable/enable), `platform/audit` |
| Device & sync | `devices/activate`, `devices/me`, `DELETE devices/{id}`, `sync/pull`, `sync/push`, `imports` (+ `device-export`) |
| Master data | `brands`, `products`, `categories`, `modifier-groups`, `payment-methods` (+ `outlets`), `promotions`, `users` (+ `pin`, `assignments`), `outlets` (+ `products`, `tables`, `devices`), `tables/{id}`, `media/images` |
| Transaksi & laporan | `orders` (+ `{id}`, `lookup`), `refunds` (+ `{id}`), `reports/sales-summary` (+ `export`) |
| Pembayaran & billing | `payments/qris`, `gateway/webhook`, `billing/subscription` |
| Integrasi | `webhooks`, `webhooks/{id}/deliveries`, `webhook-deliveries/{id}/retry` |

Background (worker arq): relay outbox → read model laporan & webhook keluar (tiap 5 detik), job billing harian. 30 migrasi Alembic.

### Kualitas & tooling

- **Test**: 63 file test API (unit, integrasi Postgres, HTTP e2e, isolasi tenant, concurrency; coverage 86%), 66 file test unit/komponen web, 35 file test admin, 6 spec Playwright web (chromium + tablet) + 4 skenario full-stack + 4 skenario e2e admin terhadap API asli.
- **Fixture bersama** `pricing-cases.json`, `order-placed-variants.json`, `refund-cases.json`, `correction-events.json`, `discount-approval-cases.json`, `device-export.json`: hitungan dan payload device = server.
- **CI** GitHub Actions per folder (`api.yml`, `web.yml`, `admin.yml`, `operator.yml`): lint, typecheck (tsc / mypy --strict), test; `openapi.json` dicek tetap sinkron.
- **Dev tanpa Docker**: satu `Makefile` di root (`make setup`, `make dev`, `make check`, `make doctor`). Docker hanya untuk deployment ([`deploy/staging`](../deploy/staging/README.md)).

## Yang Belum Selesai

### Fase 6 — selesai

Semua item di [10](./10-multi-company-brand.md) dan [11](./11-trial-features.md) terimplementasi, ditambah kebijakan diskon per brand (migrasi `0016`–`0020`, Dexie v5). Owner aktif terakhir dijaga di perubahan penugasan, nonaktifkan, dan hapus user. Catatan sisa: laporan hanya mencakup outlet yang belum dihapus — saat ini outlet belum bisa dihapus, jadi baru relevan bila fitur hapus outlet ditambahkan; slip void/refund tercetak sudah dibuat di Fase 7 (belum diuji dengan printer asli).

### Fase 7 — kode selesai, tinggal uji perangkat keras

Driver Web Serial, Web Bluetooth (BLE), WebUSB, Print Bridge LAN + Epson ePOS, slip void/refund, dan kitchen ticket per printer role sudah dibuat dan teruji dengan fake driver ([08 Fase 7](./08-roadmap-and-testing.md#fase-7--printer--uji-perangkat-asli)). Sisa:

| Item | Terblok oleh |
|---|---|
| Spike / uji semua driver dengan printer asli ([checklist](./04-printing.md#checklist-pengujian-printer)) | Printer fisik |
| Driver Star WebPRNT | Printer Star untuk diuji |
| Cetak ulang tiket dapur/bar | Belum dikerjakan (tiket BATAL sudah ada — ADR-028, [14](./14-pilot-readiness.md) P0-1) |
| Uji manual di tablet Android & PC Windows (install PWA, mode pesawat, reboot, cetak) | Perangkat uji |

### Lainnya

| Item | Catatan |
|---|---|
| Adapter payment gateway (Midtrans/Xendit) | Menunggu pilihan vendor |
| E-wallet callback langsung, wrapper Capacitor | Ditunda, hanya bila dibutuhkan |
| Deployment staging | ✅ Siap dijalankan: `poslite-api/Dockerfile`, [`deploy/staging`](../deploy/staging/README.md) (compose API + worker + PostgreSQL + Redis + Caddy, script backup, runbook), `vercel.json` POS, back-office & konsol operator, job CI `image`. Tinggal provisioning VPS, DNS, dan tiga project Vercel |
| Deployment production | Setelah pilot staging: adapter gateway asli, monitoring/alerting, backup off-site teruji, ukur NFR di perangkat asli |

### Perbaikan dokumen (selesai bersama Fase 6)

✅ Desain [10](./10-multi-company-brand.md)/[11](./11-trial-features.md) sudah digabung ke dokumen induknya: ADR-022–024 ke [01](./01-system-architecture.md), schema ke [06](./06-domain-and-database.md), endpoint & event ke [07](./07-api-contract.md), Dexie v5 ke [03](./03-offline-sync.md), modul brand/akses ke [05](./05-backend-architecture.md). Perbaikan yang ikut dikerjakan:

1. [06](./06-domain-and-database.md) `sync_events`: tulis PK `(tenant_id, id)` (sesuai migrasi 0006), bukan `id`.
2. [03](./03-offline-sync.md) Delta Pull: urutan version = urutan commit **per tenant** (ADR-009), bukan global.
3. [07](./07-api-contract.md) contoh token aktivasi `"1|abc…"` (format Sanctum) → contoh `secrets.token_urlsafe`.
4. [03](./03-offline-sync.md) Offline Auth: penomoran 1–6 berurutan.
5. [07](./07-api-contract.md) tabel back-office: hapus baris kosong sebelum `/billing/subscription` agar tabel tidak terpotong.
6. [01](./01-system-architecture.md) diagram komponen: tambah modul `tenancy`, `promotion`, `billing`, `gateway`, `integration` (dan `brand` setelah Fase 6).

## Prioritas Berikutnya

Urutan rinci, estimasi, dan kriteria Go/No-Go ada di [14 — Rencana Perbaikan Menuju Pilot](./14-pilot-readiness.md). Ringkasnya:

1. **Jalankan staging** (VPS + Vercel, ikuti runbook [`deploy/staging`](../deploy/staging/README.md)) dan pilot di satu perusahaan (2 brand / beberapa outlet), termasuk uji manual PWA di tablet Android & PC Windows tanpa printer.
2. **Uji printer asli** (Fase 7) begitu printer tersedia — kodenya sudah ada, termasuk slip void/refund & kitchen ticket.
3. Pilih vendor gateway → adapter di balik port `PaymentGateway`.
4. **Konsol operator** — fitur support dasar sudah ada (ADR-025). Sisa yang disengaja belum dibuat: peran operator (semua operator setara), 2FA operator (05 menyebut 2FA, belum diterapkan; dijadwalkan di [14](./14-pilot-readiness.md) P1-8), impersonate/login sebagai tenant, ubah harga per tenant, dan membuat tenant dari konsol (tetap lewat signup).