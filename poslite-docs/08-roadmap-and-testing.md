# 08 — Roadmap & Testing Strategy

## Fase Development

### Fase 0 — Foundation & Spike (± 1 minggu)
Tujuan: membuktikan 3 risiko teknis terbesar sebelum membangun fitur.

- [x] Repo `poslite-web` (Next.js, TS strict, ESLint boundaries, Vitest, Playwright) & `poslite-api` (FastAPI, uv, pytest, mypy --strict, ruff, import-linter, Alembic, Postgres lokal via Makefile) dalam satu monorepo (`make dev` di root menjalankan keduanya)
- [ ] **Spike PWA**: Serwist configurator mode → app bisa dibuka **offline setelah reload** di Chrome Android & Windows. Jika gagal → fallback Vite (ADR-002)
- [ ] **Spike printer**: test print ESC/POS dari printer yang benar-benar akan dipakai (Web Serial Bluetooth Classic di Android, dan di Windows)
- [ ] **Spike Dexie**: 5.000 order dummy — cek performa query & ukuran storage
- [x] CI: lint + typecheck + unit test API & web (workflow terpisah per folder)

### Fase 1 — Core Selling Offline (MVP-1)
- [ ] Domain `pricing` (termasuk **PB1 & service charge** dalam bps), `cart`, `receipt-number` + unit test (port dari prototype)
- [ ] Pecah `page.tsx` prototype → `features/catalog`, `cart`, `checkout`
- [ ] Dexie schema v1, repository, seed data lokal (belum ada backend)
- [ ] PIN lock screen (hash lokal), shift open/close, place order, riwayat order, reprint
- [ ] Cetak struk: driver **Web Serial** (Bluetooth Classic) + System print fallback
- [ ] Fase 1b: driver Web Bluetooth (BLE) & WebUSB
- [ ] Laporan shift lokal
- **DoD**: kasir bisa buka shift → jual → cetak struk → tutup shift **tanpa internet sama sekali**, data bertahan setelah reboot tablet.

### Fase 2 — Backend & Sync (MVP-2)
- [ ] Module **Tenancy** + RLS di semua tabel tenant + test isolasi antar tenant (ADR-013)
- [ ] Module Identity, Organization, Catalog, Payment (CRUD back-office API)
- [ ] Aktivasi device + opaque device token (tabel `api_tokens`)
- [ ] Delta pull (sequence `sync_version_seq` + trigger serial `assign_sync_version`, ADR-009)
- [ ] Push sync: `sync_events`, handler registry, savepoint per event, PlaceOrder/OpenShift/CloseShift/VoidOrder use case (ADR-010)
- [ ] Transactional outbox + relay arq (ADR-012)
- [ ] Sync engine di frontend (outbox, backoff, Web Locks, status badge)
- **DoD**: 2 device offline 1 hari, masing-masing 200 transaksi → online → semua masuk server tanpa duplikat, nomor struk unik. Device tenant B tidak pernah menerima data tenant A.

### Fase 3 — Back-office & Reporting
- [ ] Signup & onboarding tenant (buat bisnis + owner + outlet pertama), platform admin minimal (list/suspend tenant)
- [ ] Back-office web (Next.js): menu, harga per outlet, user & PIN, payment method, device management
- [ ] Reporting read model + projector + rebuild command
- [ ] Dashboard penjualan, export CSV/Excel

### Fase 4 — Restaurant Features
- [ ] Dine-in: meja, open bill / simpan order, split bill
- [ ] Kitchen ticket per printer role (kitchen/bar)
- [ ] Split payment, diskon per item, promo
- [ ] Print Bridge untuk printer LAN + driver HTTP Epson ePOS / Star WebPRNT

### Fase 5 — Scale & Integrasi
- [ ] Billing & subscription tenant (plan, trial, suspend otomatis)
- [ ] Integrasi QRIS dinamis (payment gateway), e-wallet callback
- [ ] Integrasi inventory / ERP / RestaurantOps (konsumsi domain event dari `outbox_messages`) — inventory **tidak** dibangun di POSLite
- [ ] Wrapper native (Capacitor) bila perlu iOS + Bluetooth

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
