# POSLite — Architecture Docs

Dokumentasi arsitektur untuk **POSLite**: SaaS Point of Sales berbasis **PWA offline-first** untuk restoran, **multi perusahaan → multi brand → multi outlet**, dengan dukungan printer thermal (Bluetooth, USB, LAN, system print).

Sumber awal: prototype `budipriyoutomo/maharasa-pos` (Next.js 15 + shadcn/ui, dibuat via v0).

## Daftar Dokumen

| # | File | Isi |
|---|------|-----|
| 00 | [00-prototype-analysis.md](./00-prototype-analysis.md) | Apa yang sudah ada di prototype, gap, dan yang harus dibuang |
| 01 | [01-system-architecture.md](./01-system-architecture.md) | Gambaran besar: komponen sistem, tech stack, ADR (keputusan arsitektur) |
| 02 | [02-frontend-architecture.md](./02-frontend-architecture.md) | Next.js PWA: struktur folder, layer, state, routing, service worker |
| 03 | [03-offline-sync.md](./03-offline-sync.md) | Local DB (IndexedDB), outbox pattern, idempotency, delta sync, conflict rules |
| 04 | [04-printing.md](./04-printing.md) | Printer abstraction, driver Bluetooth/USB/Serial/LAN/System, ESC/POS, browser matrix |
| 05 | [05-backend-architecture.md](./05-backend-architecture.md) | Python/FastAPI modular monolith + DDD/CQRS, bounded contexts, auth device + PIN |
| 06 | [06-domain-and-database.md](./06-domain-and-database.md) | Domain model, business rules, schema tabel |
| 07 | [07-api-contract.md](./07-api-contract.md) | Endpoint REST v1, payload sync, error format |
| 08 | [08-roadmap-and-testing.md](./08-roadmap-and-testing.md) | Fase development, Definition of Done, strategi testing |
| 09 | [09-scope-and-status.md](./09-scope-and-status.md) | Lingkup project (termasuk / tidak termasuk), status pekerjaan, sisa pekerjaan & prioritas |
| 10 | [10-multi-company-brand.md](./10-multi-company-brand.md) | **Fase 6**: hierarki Perusahaan → Brand → Outlet, hak akses user, konteks aktif, schema & migrasi (ADR-022) |
| 11 | [11-trial-features.md](./11-trial-features.md) | **Fase 6**: void & refund (ADR-023), pindah meja, metode bayar per outlet, export/import darurat (ADR-024) |
| 12 | [12-responsive-ui.md](./12-responsive-ui.md) | UI responsive HP/tablet & modern: breakpoint, aturan warna/token, TODO per fase |
| 13 | [13-day-closing.md](./13-day-closing.md) | Tutup hari per outlet (ADR-026): snapshot rekap harian, peringatan shift terbuka/device belum sync, endpoint |

## Keputusan Utama (TL;DR)

1. **Offline-first, bukan "offline-capable"** — kasir selalu menulis ke IndexedDB dulu, server adalah tujuan sinkronisasi, bukan dependency transaksi.
2. **Frontend**: Next.js (App Router) + TypeScript strict, semua layar POS adalah Client Component yang di-prerender statis, service worker via **Serwist**. Local DB **Dexie.js**, UI state **Zustand**.
3. **Backend**: **Python 3.12 + FastAPI**, SQLAlchemy 2.0 async, PostgreSQL, Alembic, arq. Modular Monolith dengan layer Clean/Hexagonal per module, CQRS ringan (write model transaksi, read model laporan). Auth: opaque token per-device + PIN kasir.
4. **ID dibuat di client** (ULID) → transaksi offline bisa langsung punya ID final, sync jadi idempotent.
5. **Transaksi immutable** (append-only). Void/refund = dokumen baru. Tidak ada konflik edit di transaksi.
6. **Master data server-wins** (produk, harga, user, payment method) — device hanya read + delta pull.
7. **Uang = integer Rupiah** (tanpa float) di semua layer; tarif dalam basis poin, pembulatan lewat satu helper integer half-up (ADR-005).
8. **Printing lewat interface `PrinterDriver`** dengan beberapa implementasi; ESC/POS di-generate di browser.
9. **Multi-tenant SaaS sejak awal** — satu database, semua data ber-`tenant_id`, isolasi antar perusahaan di-enforce PostgreSQL Row-Level Security (ADR-013).
10. **Perusahaan → Brand → Outlet** — tenant = perusahaan; brand punya menu & promo sendiri; akses user ke brand/outlet lewat penugasan dan ditegakkan di application layer (ADR-022).

## Lokasi Dokumen di Repo

Folder `poslite-docs/` di monorepo ini adalah **sumber tunggal** untuk keempat app (`poslite-web`, `poslite-admin`, `poslite-operator`, `poslite-api`). `poslite-web/docs/architecture` dan `poslite-api/docs/architecture` adalah symlink ke folder ini, karena `AGENTS.md` di kedua app merujuk ke `docs/architecture/*.md`. Edit hanya di `poslite-docs/`.

## Asumsi (koreksi jika salah)

- Target device utama: tablet/HP **Android + Chrome**, dan PC/laptop kasir **Windows + Chrome/Edge**.
- **Tenant = Perusahaan** (satu pelanggan SaaS). Satu perusahaan punya beberapa **brand**, satu brand beberapa **outlet**, tiap outlet beberapa **device** POS.
- Satu user (email) milik tepat satu perusahaan; di dalamnya user hanya melihat brand/outlet yang ditugaskan, dan memilih brand/outlet aktif di back-office.
- Billing per outlet aktif di seluruh brand (ADR-018).
- Payment gateway memakai `FakeGateway` sampai vendor dipilih (ADR-017); QRIS statis/Debit dicatat manual.

## Keputusan Produk

### 2026-09-25

| Pertanyaan | Keputusan | Dampak |
|---|---|---|
| Multi-tenant SaaS? | **Ya, sejak awal.** Shared database + `tenant_id` + PostgreSQL RLS | ADR-013; module `tenancy`; signup tenant di Fase 3; billing di Fase 5 |
| Dine-in & kitchen ticket di MVP? | **Tidak** — MVP quick-service (bayar di depan) | Order MVP langsung `paid`; meja, open bill, split bill, KOT tetap Fase 4 |
| PB1 & service charge di MVP? | **Ya, keduanya** | Tarif per outlet (bps), boleh 0; masuk pricing Fase 1 |
| Printer yang dipakai? | Bluetooth Classic 58mm, BLE, USB, LAN — **semua** | Driver printer dikerjakan **terakhir** (Fase 7, lihat keputusan 2026-10-07) |
| Inventory? | **Tidak di MVP**; nanti integrasi ke sistem lain | Domain event di `outbox_messages` jadi titik integrasi (Fase 5) |

### 2026-10-07

| Pertanyaan | Keputusan | Dampak |
|---|---|---|
| Multi company? | **Perusahaan → Brand → Outlet.** User hanya melihat perusahaannya; pilih brand & outlet aktif | ADR-022, dokumen [10](./10-multi-company-brand.md), Fase 6 |
| Fitur non-printer untuk trial? | Void/refund, pindah meja, metode bayar per outlet, export/import darurat | ADR-023, ADR-024, dokumen [11](./11-trial-features.md), Fase 6 |
| Kapan printer? | **Terakhir**, setelah fitur trial non-printer | Fase 7 di [08](./08-roadmap-and-testing.md) |