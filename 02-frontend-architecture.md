# 02 — Frontend Architecture (POS PWA)

## Prinsip

- **Clean Architecture ringan per feature**: `domain` (pure TS, tanpa React) → `application` (use-case / hooks) → `infrastructure` (Dexie repo, API client, printer driver) → `presentation` (komponen).
- Komponen UI **tidak pernah** memanggil Dexie/fetch langsung — selalu lewat hook/use-case.
- Business rule (total, diskon, pajak, kembalian) = **pure function** → mudah di-TDD dan bisa disamakan dengan backend.
- Semua layar POS **client-rendered & prerendered statis** (lihat ADR-002).

## Struktur Folder

```
poslite-web/
├── src/
│   ├── app/                              # Routing only — tipis
│   │   ├── layout.tsx                    # <html>, providers, SerwistProvider, manifest
│   │   ├── manifest.ts                   # Web App Manifest
│   │   ├── sw.ts                         # Service worker source (Serwist)
│   │   ├── (setup)/
│   │   │   └── activate/page.tsx         # Aktivasi device (login manager + pilih outlet)
│   │   ├── (auth)/
│   │   │   └── lock/page.tsx             # PIN login / lock screen
│   │   └── (pos)/
│   │       ├── layout.tsx                # Guard: device aktif + kasir login + shift terbuka
│   │       ├── sell/page.tsx             # Katalog + cart
│   │       ├── checkout/page.tsx         # Pembayaran
│   │       ├── orders/page.tsx           # Riwayat order device (void/reprint) — detail via ?id=
│   │       ├── shift/page.tsx            # Buka/tutup shift, cash in/out
│   │       ├── reports/page.tsx          # Laporan shift lokal (offline)
│   │       └── settings/
│   │           ├── page.tsx
│   │           └── printers/page.tsx     # Pairing & test print
│   │
│   ├── features/
│   │   ├── catalog/
│   │   │   ├── domain/                   # Product, Category, ModifierGroup types
│   │   │   ├── application/              # useCatalog, useProductSearch
│   │   │   ├── infrastructure/           # catalog.repository.ts (Dexie)
│   │   │   └── components/               # ProductGrid, CategoryTabs, ProductCard
│   │   ├── cart/
│   │   │   ├── domain/                   # cart.ts: addLine, mergeKey, calcLineTotal
│   │   │   ├── application/              # cart.store.ts (Zustand), useCart
│   │   │   └── components/               # CartPanel, CartDrawer, CartLine, EditLineDialog
│   │   ├── checkout/
│   │   │   ├── domain/                   # pricing.ts (subtotal, discount, tax, total), change.ts
│   │   │   ├── application/              # usePlaceOrder (→ order + payments + outbox + print)
│   │   │   └── components/               # PaymentMethodPicker, CashKeypad, DiscountPicker
│   │   ├── orders/                       # riwayat, void, reprint
│   │   ├── shift/                        # open/close shift, cash movement
│   │   ├── auth/                         # device activation, PIN lock, session
│   │   ├── printing/                     # lihat 04-printing.md
│   │   ├── sync/                         # lihat 03-offline-sync.md
│   │   └── reports/                      # agregasi lokal dari Dexie
│   │
│   ├── shared/
│   │   ├── db/
│   │   │   ├── db.ts                     # Dexie schema & versions
│   │   │   └── migrations.ts
│   │   ├── api/
│   │   │   ├── http-client.ts            # fetch wrapper: token, timeout, retry, error mapping
│   │   │   └── schema.d.ts               # Digenerate dari OpenAPI (openapi-typescript)
│   │   ├── money/                        # formatRupiah, parseRupiah (integer)
│   │   ├── id/                           # newId() → ULID
│   │   ├── hooks/                        # useOnlineStatus, useWakeLock
│   │   └── ui/                           # shadcn/ui components
│   └── config/env.ts                     # @t3-oss/env-nextjs
├── tests/
│   ├── unit/                             # Vitest
│   └── e2e/                              # Playwright (termasuk mode offline)
├── serwist.config.js
└── next.config.ts
```

> Aturan dependency: `components → application → domain`, `application → infrastructure (via interface)`. `domain` tidak meng-import apa pun dari React/Dexie/fetch. Enforce dengan `eslint-plugin-boundaries` atau `dependency-cruiser`.

## State Management

| Jenis state | Tempat | Contoh |
|---|---|---|
| Persisted domain data | **Dexie** (IndexedDB) | produk, order, payment, shift, outbox, printer config |
| Cart aktif | **Zustand** + `persist` ke IndexedDB | Cart tidak hilang saat app ter-reload / tablet restart |
| Sesi kasir | Zustand (memory) + Dexie `sessions` | kasir aktif, auto-lock setelah idle |
| Server-only data | TanStack Query (opsional) | Laporan lintas outlet di back-office |
| UI transient | `useState` lokal | dialog open, tab aktif |

Baca data dari Dexie dengan `useLiveQuery` → UI otomatis update saat sync menulis data baru.

## Contoh: Domain Pricing (pure, TDD-ready)

```ts
// shared/money/rounding.ts — satu-satunya fungsi pembulatan uang (ADR-005)
/** Half-up integer division for n >= 0: floor(n / d + 0.5) without floats. */
export function divRoundHalfUp(n: number, d: number): number {
  return Math.floor((2 * n + d) / (2 * d));
}
```

```ts
// features/checkout/domain/pricing.ts
import { divRoundHalfUp } from '@/shared/money';

export type Discount =
  | { type: 'percentage'; value: number } // integer 0..100
  | { type: 'fixed'; value: number };      // Rupiah (integer)

export interface Rates {
  serviceBps: number;  // basis poin: 500 = 5%
  taxBps: number;      // 1000 = 10%
}

export interface PricedLine {
  unitPrice: number;          // Rupiah
  modifiersTotal: number;     // Rupiah, per unit
  quantity: number;
}

export interface PriceBreakdown {
  subtotal: number;
  discountAmount: number;
  serviceCharge: number;
  tax: number;
  total: number;
}

export function lineTotal(l: PricedLine): number {
  return (l.unitPrice + l.modifiersTotal) * l.quantity;
}

export function calculate(
  lines: PricedLine[],
  discount: Discount | null,
  rates: Rates, // snapshot dari setting outlet saat transaksi — ikut dikirim di payload (ADR-011)
): PriceBreakdown {
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const rawDiscount = !discount ? 0
    : discount.type === 'percentage' ? divRoundHalfUp(subtotal * discount.value, 100)
    : discount.value;
  const discountAmount = Math.min(rawDiscount, subtotal);
  const net = subtotal - discountAmount;
  const serviceCharge = divRoundHalfUp(net * rates.serviceBps, 10_000);
  const tax = divRoundHalfUp((net + serviceCharge) * rates.taxBps, 10_000);
  return { subtotal, discountAmount, serviceCharge, tax, total: net + serviceCharge + tax };
}
```

Aturan yang sama diimplementasikan di backend (`poslite.sales.domain.services.PriceCalculator` + `poslite.shared.domain.money.div_round_half_up`) dan diuji dengan **fixture test bersama** `tests/fixtures/pricing-cases.json` (dipakai Vitest & pytest) supaya hasil selalu identik. Semua operand integer dan jauh di bawah `Number.MAX_SAFE_INTEGER`, jadi hasil JS eksak.

## Contoh: Use-case Place Order

```ts
// features/checkout/application/usePlaceOrder.ts
export function usePlaceOrder(deps = defaultDeps) {
  return async (input: PlaceOrderInput): Promise<Order> => {
    const order = buildOrder(input);                 // domain: snapshot harga, nomor struk, ULID
    await deps.db.transaction('rw', [deps.db.orders, deps.db.payments, deps.db.outbox], async () => {
      await deps.orderRepo.save(order);
      await deps.outbox.enqueue({ type: 'order.placed', aggregateId: order.id, payload: toSyncPayload(order) });
    });
    deps.sync.kick();                                 // fire-and-forget
    void deps.printService.print(receiptJob(order));  // gagal print ≠ gagal transaksi
    return order;
  };
}
```

## PWA & Service Worker

- **Precache**: semua route POS hasil prerender, JS/CSS chunk, font, ikon, gambar placeholder.
- **Runtime cache**: gambar produk → `CacheFirst` (expire 30 hari, max 500 entry). API **tidak** di-cache oleh SW — data API masuk ke Dexie lewat sync engine.
- **Update flow**: SW baru di-install diam-diam; tampilkan banner "Versi baru tersedia" dan **hanya reload saat cart kosong** (jangan ganggu transaksi berjalan).
- **Manifest**: `display: "standalone"` (atau `fullscreen` untuk kiosk), `orientation: "landscape"`, ikon maskable 192/512.
- **Storage**: panggil `navigator.storage.persist()` saat aktivasi device; tampilkan peringatan bila ditolak. Pantau `navigator.storage.estimate()`.
- **Screen Wake Lock API** saat shift terbuka agar layar tidak mati.

## Routing Guard (di `(pos)/layout.tsx`)

1. Device belum aktif → `/activate`
2. Belum ada kasir login / idle lock → `/lock`
3. Shift belum dibuka → `/shift` (kecuali role manager)
4. Lanjut ke `/sell`

## UX Offline

- Badge status di header: 🟢 Online · 🟡 Syncing (n) · 🔴 Offline (n pending).
- Semua aksi kasir tetap aktif saat offline. Aksi yang butuh server (mis. lihat laporan outlet, ganti harga) di-disable dengan tooltip.
- Halaman `settings` menampilkan antrian outbox + tombol "Sync sekarang" + "Export data darurat" (download JSON).

## Testing

- **Unit (Vitest)**: `domain/*` — pricing, cart merge, receipt number, change calculation.
- **Component (RTL)**: CartPanel, CashKeypad, PaymentMethodPicker.
- **Integration**: use-case + `fake-indexeddb` + MSW untuk API.
- **E2E (Playwright)**: flow jual → bayar → struk, dengan `context.setOffline(true)` lalu online lagi dan cek sync.
