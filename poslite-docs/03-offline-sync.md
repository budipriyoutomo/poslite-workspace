# 03 — Offline Storage & Sync

## Dexie Schema (IndexedDB)

```ts
// shared/db/db.ts
import Dexie, { type Table } from 'dexie';

export class PosDb extends Dexie {
  // Master data (pull dari server, read-only di device)
  categories!: Table<CategoryRow, string>;
  products!: Table<ProductRow, string>;
  modifierGroups!: Table<ModifierGroupRow, string>;
  paymentMethods!: Table<PaymentMethodRow, string>;
  users!: Table<UserRow, string>;            // kasir di outlet ini + pin_hash
  settings!: Table<SettingRow, string>;      // outlet profile, tax/service rate, receipt header/footer
  diningTables!: Table<DiningTableRow, string>; // v3 (Fase 4): meja outlet ini
  promotions!: Table<PromotionRow, string>;  // v3: promo aktif untuk outlet ini, dievaluasi offline (ADR-016)

  // Transaksional (dibuat di device)
  shifts!: Table<ShiftRow, string>;
  orders!: Table<OrderRow, string>;          // termasuk lines & modifiers (embedded snapshot)
  payments!: Table<PaymentRow, string>;
  cashMovements!: Table<CashMovementRow, string>;
  openBills!: Table<OpenBillRow, string>;    // v3: bill dine-in belum dibayar — lokal, TIDAK masuk outbox (ADR-015)

  // Infrastruktur
  outbox!: Table<OutboxRow, number>;
  syncState!: Table<SyncStateRow, string>;   // state lokal device: receiptCounter, pinLockout (+ cursor pull, lastPushAt di Fase 2)
  printers!: Table<PrinterConfigRow, string>;
  printJobs!: Table<PrintJobRow, string>;

  constructor() {
    super('poslite');
    this.version(1).stores({
      categories: 'id, sortOrder',
      products: 'id, categoryId, sku, name, isActive',
      modifierGroups: 'id',
      paymentMethods: 'id, type, sortOrder',
      users: 'id',
      settings: 'key',
      shifts: 'id, status, openedAt',
      orders: 'id, shiftId, status, createdAt, businessDate, receiptNo, syncStatus',
      payments: 'id, orderId',
      cashMovements: 'id, shiftId',
      outbox: '++seq, [status+seq], createdAt, aggregateId',   // [status+seq]: batch push tanpa scan (spike Fase 0)
      syncState: 'key',
      printers: 'id, role',
      printJobs: 'id, status, createdAt',
    });
  }
}
```

Perubahan skema = `this.version(n).stores(...).upgrade(tx => ...)` — jangan edit versi lama.

Versi yang sudah ada: v2 `modifierOptions`; v3 `diningTables`, `promotions`, `openBills`; v4 `products.imageKey` (ADR-021); **v5** `refunds: 'id, orderId, shiftId, businessDate, createdAt, syncStatus'` (ADR-023 — baris & pembayaran refund disimpan di dalam dokumennya). `orders.voidedAt`/`voidReason` dan `syncState.refundCounter` tidak butuh index. Event outbox baru: `order.voided`, `order.refunded`. Export darurat (ADR-024) membaca seluruh `outbox` tanpa menghapusnya.

## Outbox Pattern (Push)

Setiap aksi kasir menulis **data + event outbox dalam satu Dexie transaction**. Tidak mungkin data tersimpan tapi event tidak (atau sebaliknya).

```ts
interface OutboxRow {
  seq?: number;                 // auto increment lokal → urutan kirim
  id: string;                   // ULID = Idempotency-Key
  type: 'shift.opened' | 'shift.closed' | 'order.placed' | 'order.voided' | 'cash.moved';
  aggregateId: string;
  payload: unknown;             // divalidasi Zod sebelum enqueue
  status: 'pending' | 'sending' | 'failed' | 'dead';
  attempts: number;
  lastError?: string;
  createdAt: string;            // ISO, waktu device
}
```

### Algoritma push

```
loop (dipicu: app start, event 'online', setiap 15 detik saat online, kick() setelah transaksi):
  ambil lock (Web Locks API: navigator.locks.request('sync', ...)) → cegah 2 tab sync bersamaan
  batch = outbox where status in (pending, failed) order by seq limit 50
  POST /api/v1/sync/push { events: batch }      # device id dari token + header X-Device-Id
  untuk setiap hasil per-event:
    accepted | duplicate  → hapus dari outbox, tandai order.syncStatus = 'synced'
    flagged               → sama seperti accepted (data SUDAH tersimpan di server); simpan `flags`
                            di order lokal untuk info, tidak perlu tindakan kasir
    rejected (4xx bisnis) → status = 'dead', simpan error, tampilkan di layar Sync (butuh tindakan manager)
    error jaringan / 5xx  → status = 'failed', attempts++, backoff eksponensial (max 5 menit)
```

- Event `dead` bisa **dikirim ulang** oleh manager dari layar Sync setelah penyebabnya dibereskan (mis. kasir ditambahkan ke outlet). Server memproses ulang event yang sebelumnya `rejected` (lihat [07](./07-api-contract.md#push)); event yang sudah `accepted`/`flagged` selalu dijawab `duplicate`.

- Urutan event per aggregate dijaga (`shift.opened` sebelum `order.placed` di shift tsb). Server juga toleran: bila order datang sebelum shift, simpan dan link belakangan.
- **Background Sync API** (Chromium) dipakai sebagai bonus agar sync jalan walau tab tertutup; mekanisme utama tetap loop di atas.

## Delta Pull (Master Data)

```
GET /api/v1/sync/pull?cursor=<lastVersion>&limit=500
→ { changes: [{ entity, op: 'upsert'|'delete', id, version, data }], next_cursor, has_more }
```

- Server menyimpan kolom `version` (bigint, dari **satu sequence global** untuk semua tabel master) yang naik setiap insert/update/soft-delete. Version dibagikan secara serial **per tenant** (advisory lock per tenant sampai commit) sehingga urutan version = urutan commit di dalam satu tenant (ADR-009) — cursor device, yang hanya melihat tenant-nya, tidak pernah melompati perubahan.
- Device apply perubahan dalam satu Dexie transaction per halaman, lalu simpan `next_cursor`.
- **Initial sync** saat aktivasi: cursor = 0 → tarik semua. Tampilkan progress.
- Gambar produk tidak ikut payload; SW cache saat pertama kali ditampilkan (opsional: prefetch saat initial sync).

## Aturan Konflik

| Data | Pemilik | Aturan |
|---|---|---|
| Produk, harga, kategori, modifier, payment method, user, setting | Server | **Server wins**. Device tidak pernah mengubah. |
| Order, payment, shift, cash movement | Device pembuat | **Immutable, append-only**. Server tidak mengubah isi; hanya menerima/menolak. |
| Void / refund | Device (butuh PIN manager) | Event baru `order.voided` yang mereferensikan order asal. Jika order asal belum sampai server, void disimpan pending sampai order asal masuk. |
| Harga berubah saat device offline | — | Order tetap memakai harga snapshot saat transaksi (legal & sesuai struk yang dicetak). |
| Produk dihapus/nonaktif saat offline | — | Order tetap valid (snapshot nama & harga). |

## Nomor Struk Offline

Tidak bisa pakai counter server. Format:

```
{OUTLET_CODE}{DEVICE_CODE}-{YYMMDD}-{SEQ}
contoh: JKT01A-260925-0042
```

- `DEVICE_CODE` diberikan server saat aktivasi (unik per outlet).
- `SEQ` = counter harian di `syncState` device, di-increment dalam transaction yang sama dengan penyimpanan order.
- ID teknis tetap ULID; `receipt_no` hanya untuk manusia (unik per outlet via constraint server).

## Offline Auth

1. **Aktivasi device** (online, sekali): manager login email+password → pilih outlet → server membuat `device` + opaque token berumur panjang (hash disimpan di server, ability `device:*`). Token disimpan di IndexedDB.
2. **PIN kasir** (offline-capable): server mengirim daftar user outlet + `pin_hash` (PBKDF2-SHA256, salt per user, iterasi tinggi) via pull. Device memverifikasi PIN dengan WebCrypto.
3. Setiap event yang di-push membawa `cashier_id`; server memverifikasi user tsb memang aktif di outlet itu pada waktu event.
4. Rate limit lokal: 5 PIN salah → lock 1 menit, lalu berlipat tiap 5 salah berikutnya; state disimpan di IndexedDB (`syncState.pinLockout`) agar reload tidak mereset.
5. Layar lock: kasir **memilih nama** lalu memasukkan PIN (bukan PIN saja) — cukup satu PBKDF2 per percobaan, dan jejak audit jelas. Layar lock langsung terbuka pada kasir terakhir yang login di device itu (cukup ketik PIN; "Ganti kasir" untuk memilih nama lain), dan daftar nama mengurutkan yang terakhir login lebih dulu — disimpan di `syncState.recentLogins` (maks. 5 user).
6. Revoke device dari back-office → request berikutnya 401 → device wipe data sensitif (users, token) tapi **outbox tetap dipertahankan** sampai diekspor/di-sync oleh device yang di-aktivasi ulang.

> Trade-off: PIN 4 digit rawan brute-force offline jika device dicuri. Mitigasi: PIN 6 digit untuk manager, hash dengan iterasi tinggi, wipe via revoke, dan PIN hanya membuka aksi di device itu (bukan kredensial API).

## Keandalan Data

- `navigator.storage.persist()` saat aktivasi.
- Transaksi lebih tua dari N hari **dan sudah synced** di-prune otomatis (default 30 hari) untuk menjaga ukuran DB.
- Tombol **Export darurat** (JSON seluruh outbox + order belum sync) → bisa diimport via back-office jika device rusak.
- Jangan pernah `db.delete()` saat logout.
