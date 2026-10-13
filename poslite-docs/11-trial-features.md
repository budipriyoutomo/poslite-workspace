# 11 — Fitur Non-Printer untuk Trial

Status: **selesai** (2026-10-07, Fase 6b/6c). Printer dikerjakan terakhir (Fase 7).

### Catatan implementasi

- **Dexie v5**, bukan v4 (v4 sudah dipakai ADR-021). `order_voids` memakai `order_id` sebagai PK.
- Event koreksi diuji lewat fixture bersama terpisah `tests/fixtures/correction-events.json` (agar `sync-events.json` tetap "satu penjualan" untuk test lama).
- Approval: `approved_by` boleh `null` bila kasir yang login sendiri manajer/owner; server lalu memeriksa permission orang itu.
- Refund lintas device saat online: layar Riwayat → "Cari no. struk" (`GET /orders/lookup`).
- Metode bayar: outlet baru otomatis memakai semua metode perusahaan.
- Import darurat: device tidak menyimpan id perusahaannya, jadi `tenant_id` di file boleh `null` (batas perusahaan tetap dijaga RLS saat mencari device). Urutan cek di server: akses outlet + `sync.import` **sebelum** mencari device, agar user tanpa akses tidak bisa menebak device. `device_imports` adalah catatan audit import (belum ada tabel `audit_logs` umum). Checksum = SHA-256 JSON kanonik (kunci terurut, tanpa spasi), fixture bersama `device-export.json`.
- Service worker: precache mengabaikan query string, sehingga `/orders?id=…` (detail riwayat) bisa dibuka offline — sebelumnya gagal tanpa jaringan.

| # | Fitur | Butuh server? | ADR |
|---|---|---|---|
| 1 | Void \& refund order | Tidak (offline), disinkronkan | ADR-023 |
| 2 | Pindah meja open bill | Tidak (lokal device) | ADR-015 tetap |
| 3 | Metode bayar per outlet | Back-office + pull | — |
| 4 | Export \& import data darurat | Export offline, import online | ADR-024 |

---

## 1. Void \& Refund

### ADR-023 — Void = batal penuh di shift yang sama; Refund = dokumen baru, boleh sebagian, lintas shift

- **Keputusan**:
  - **Void** membatalkan seluruh order selama shift yang membuatnya masih terbuka, di device yang sama. Order tetap ada dengan status `voided` + baris `order_voids` (ADR-003: isi order tidak diubah).
  - **Refund** adalah dokumen baru `refund` dengan nomor sendiri, mereferensikan order asal, boleh per baris \& qty (sebagian), dicatat di shift \& business date **saat refund**, bukan tanggal order.
  - Keduanya butuh alasan dan **approval PIN manajer** di device (offline, PBKDF2 seperti login kasir).
  - Server **menerima** refund yang melebihi sisa order atau total yang berbeda dengan **flag**, bukan menolak — uang sudah keluar dari laci saat offline (sejalan dengan ADR-011/016).
- **Kenapa**: void hanya aman selama kas shift belum direkonsiliasi; setelah itu koreksi harus tercatat di periode saat uang keluar supaya laporan hari yang sudah ditutup tidak berubah.
- **Konsekuensi**: event baru `order.refunded`; kas shift mengurangi refund tunai; laporan punya kolom refund; satu fixture bersama baru `refund-cases.json`.

### Aturan Void

1. Hanya order `paid` milik device ini, di shift yang masih `open`. Order yang sudah punya refund tidak bisa di-void.
2. Selalu penuh (tidak ada void sebagian — itu refund).
3. Permission `order.void`. Kasir tanpa permission → dialog approval: manajer pilih nama + PIN. `approved_by` = manajer; `voided_by` = kasir aktif.
4. Alasan wajib: `Salah input`, `Pelanggan batal`, `Lainnya` (+ teks, maks 200 karakter).
5. Efek kas shift: bagian tunai order (`cash paid − change`) keluar dari `cash_sales`. Pembayaran non-cash (debit, QRIS) harus dibatalkan manual di EDC/aplikasi bank — UI menampilkan peringatan. Refund otomatis lewat gateway untuk QRIS dinamis belum termasuk trial.
6. Dexie: order `status = 'voided'`, `voidedAt`, + outbox `order.voided` dalam satu transaksi.

### Aturan Refund

1. Untuk order `paid` (bukan `voided`). Sumber order:
   - order lokal device (dari device ini, ≤ 30 hari — batas prune), atau
   - saat online: cari lewat `GET /orders/lookup?receipt_no=` (order outlet yang sama dari device mana pun).
   - Offline + order dari device lain → tidak bisa; tampilkan pesan jelas.
2. Kasir memilih baris \& qty (qty ≤ sisa yang belum di-refund). Alasan wajib, permission `order.refund` atau approval PIN manajer.
3. Butuh shift `open` di device. Metode pengembalian default = metode bayar asal; tunai diambil dari laci shift saat ini.
4. Nomor refund: `{OUTLET_CODE}{DEVICE_CODE}-R{YYMMDD}-{SEQ}` (mis. `BDG01A-R261007-0003`), counter harian `syncState.refundCounter`, unik per outlet.
5. Jumlah refund dihitung dengan **alokasi total order ke baris** (di bawah) supaya total semua refund tidak pernah melebihi total order.

### Alokasi total ke baris (pure function, web + API)

```
net_i     = line_gross_i − line_discount_i
base_i    = net_i − share_i            // share_i = alokasi diskon order ke baris, proporsional net_i
alloc_i   = alokasi `total` order ke baris, proporsional base_i
```

- Kedua alokasi memakai **largest remainder**: `floor(nilai × bobot_i / Σbobot)`, sisa dibagikan 1 Rupiah ke pecahan terbesar; seri → `sort_order` terkecil. Σ alokasi selalu sama persis dengan nilai yang dibagi. Bila Σbobot = 0, semua alokasi 0.
- Refund `q` unit dari baris `i` yang sebelumnya sudah di-refund `r` unit:
  `amount = divRoundHalfUp(alloc_i × (r + q), qty_i) − divRoundHalfUp(alloc_i × r, qty_i)` → refund bertahap selalu berjumlah tepat `alloc_i` saat seluruh qty dikembalikan.
- Lokasi: `features/orders/domain/refund-allocation.ts` dan `poslite.sales.domain.services.RefundAllocator`; fixture bersama `tests/fixtures/refund-cases.json` (diskon order persen \& nominal, diskon baris, promo, service \& PB1, refund bertahap 1+1+1 dari qty 3).

### Event

```json
// order.voided — aggregate_id = order id
{ "reason": "Salah input", "voided_by": "01J…U1", "approved_by": "01J…U2" }

// order.refunded — aggregate_id = refund id
{ "order_id": "01J…O1", "shift_id": "01J…S2", "refund_no": "BDG01A-R261007-0003",
  "reason": "Pelanggan komplain", "refunded_by": "01J…U1", "approved_by": "01J…U2",
  "lines": [ { "order_line_id": "01J…L1", "quantity": 1, "amount": 36383 } ],
  "total": 36383,
  "payments": [ { "id": "01J…RP1", "payment_method_id": "01J…CASH", "method_type": "cash",
                  "method_name": "Tunai", "amount": 36383, "reference": null } ] }
```

Validasi server:

| Kondisi | Hasil |
|---|---|
| Order tidak ada di outlet ini | `rejected` `ORDER_NOT_FOUND` |
| Void: order sudah `voided` | `rejected` `ORDER_ALREADY_VOIDED` |
| Void: device beda, shift order sudah `closed`, atau order sudah punya refund | `rejected` `VOID_NOT_ALLOWED` |
| `approved_by` tidak punya permission di outlet | `rejected` `APPROVER_NOT_ALLOWED` |
| Refund: `order_line_id` bukan milik order | `rejected` `REFUND_INVALID_LINE` |
| Refund: Σ payments ≠ `total` | `rejected` `REFUND_PAYMENT_MISMATCH` (dicegah Zod di device) |
| Refund: qty melebihi sisa (mis. dua device refund order yang sama saat offline) | `flagged` `REFUND_EXCEEDS_ORDER` |
| Refund: jumlah hitungan server ≠ device | `flagged` `TOTAL_MISMATCH` |
| Refund atas order yang ternyata `voided` | `flagged` `REFUND_ON_VOIDED` |

Urutan outbox per device menjamin `order.placed` terkirim sebelum `order.voided`/`order.refunded` dari device yang sama, dan `order.voided` sebelum `shift.closed`.

### Kas shift

```
expected_cash = opening_cash
              + cash_sales − cash_change        // order voided tidak dihitung
              + cash_in − cash_out
              − cash_refunds                    // refund tunai di shift ini
```

Server memakai rumus yang sama untuk cek `VARIANCE_MISMATCH`. Ringkasan tutup shift menampilkan jumlah \& nilai void dan refund.

### Schema

```
order_voids      id, order_id (unik), device_id, reason, voided_by, approved_by, voided_at   -- sudah ada di desain
refunds          id (ulid), outlet_id, brand_id, device_id, shift_id, order_id, refund_no (unik per outlet),
                 business_date, reason, refunded_by, approved_by, total, flags (text[]),
                 created_at (waktu device), synced_at
                 INDEX (outlet_id, business_date), INDEX (order_id)
refund_lines     id, refund_id, order_line_id, product_id, product_name (snapshot), quantity, amount
refund_payments  id, refund_id, payment_method_id, method_type, method_name, amount, reference
rpt_daily_sales          + refund_amount, refund_count   -- di business_date refund
rpt_daily_product_sales  + refund_qty, refund_amount
rpt_daily_payment_sales  + refund_amount
permissions      + order.refund
```

Dexie **v4**: tabel `refunds: 'id, orderId, shiftId, businessDate, createdAt, syncStatus'` (lines \& payments embedded), field `voidedAt` di `orders`, key `syncState.refundCounter`, tipe outbox `order.refunded`.

### API \& integrasi

| Method | Path | Keterangan |
|---|---|---|
| GET | `/orders/{id}` | Detail lengkap: lines, modifiers, payments, void, refunds (sebelumnya "belum") |
| GET | `/orders/lookup?receipt_no=` | Device (ability `device:read`), hanya outlet device; untuk refund lintas device saat online |
| GET | `/refunds?outlet_id=&business_date=` · `/refunds/{id}` | Back-office |
| Webhook | `order.voided`, `order.refunded` | Tambahan event ADR-020 |

### UI kasir

- **Riwayat** → detail order → tombol **Void** (hanya bila memenuhi aturan) dan **Refund**.
- Dialog refund: daftar baris dengan stepper qty (maks sisa), jumlah dihitung otomatis, pilih metode pengembalian, alasan, approval PIN.
- Riwayat menampilkan badge `VOID` / `REFUND SEBAGIAN` / `REFUND PENUH`.
- Laporan shift lokal: baris Void dan Refund. Slip void/refund **dicetak setelah Fase 7 (printer)**; untuk trial cukup tampil di riwayat dan antrian `printJobs` sudah menyediakan `documentType` `void_slip` / `refund_slip`.

---

## 2. Pindah Meja (Open Bill)

- Menu **Bill** → pilih bill → **Pindah meja** → daftar meja; meja yang punya open bill di device ini dinonaktifkan.
- Update `openBills.tableId` + `tableLabel` dalam satu transaksi Dexie. Tidak ada event sync dan tidak ada perubahan API (ADR-015: bill hanya ada di device pembuka).
- Batasan yang diketahui: device lain tidak tahu meja sudah terisi. UI menampilkan catatan kecil "Status meja hanya dari tablet ini".
- Gabung bill (2 meja jadi satu) **tidak** termasuk trial.
- Test: unit `moveBill` (meja tujuan kosong, meja sama, meja terisi) + langkah di `tests/e2e/dine-in-offline.spec.ts`.

---

## 3. Metode Bayar per Outlet

- Metode bayar tetap tingkat perusahaan; aktif atau tidaknya per outlet disimpan di `outlet_payment_method (outlet_id, payment_method_id)` (tabel sudah ada di desain).
- Membuat metode bayar baru: pilih outlet (default: semua outlet dalam scope). Migrasi mengisi semua metode × semua outlet supaya perilaku lama tidak berubah.
- Mengubah `outlet_payment_method` men-*touch* `payment_methods.version`.
- Pull: `payment_method` dengan `version > cursor` dikirim `upsert` bila aktif di outlet device, selain itu `delete` (pola yang sama dengan `user`).
- Push: payment dengan metode yang tidak aktif di outlet tetap diterima, `flagged` `PAYMENT_METHOD_INACTIVE` (daftar di device bisa basi saat offline).
- API: `GET /payment-methods` menyertakan `outlet_ids`; `PUT /payment-methods/{id}/outlets` `{ "outlet_ids": [...] }` (outlet di luar scope → 403 `OUTLET_FORBIDDEN`).
- Back-office: halaman Metode Bayar menampilkan matriks metode × outlet (checkbox).

---

## 4. Export \& Import Data Darurat

### ADR-024 — File export darurat diproses sebagai push atas nama device asal

- **Keputusan**: Device bisa mengekspor semua event outbox yang belum `accepted` (pending, failed, dead) ke file JSON, kapan saja, termasuk offline dan setelah token dicabut. Back-office mengimpor file itu lewat `POST /imports/device-export`, dan server menjalankan event-nya melalui **`PushEventsHandler` yang sama** atas nama device asal (lock per device, idempotency, savepoint per event).
- **Kenapa**: satu jalur pemrosesan → aturan bisnis, flag, dan idempotency identik dengan sync biasa; mengimpor file yang sama dua kali aman (`duplicate`).
- **Alternatif ditolak**: tanda tangan file dengan kunci device — device yang rusak/dicabut mungkin sudah kehilangan kuncinya, justru saat file ini dibutuhkan.
- **Konsekuensi**: checksum hanya mendeteksi file rusak, bukan pemalsuan. Mitigasi: hanya manajer dengan scope outlet tersebut yang bisa import, semua event divalidasi seperti push biasa (kasir harus anggota outlet, shift harus valid), dan setiap import diaudit.

### Format file

```json
{ "format": "poslite-device-export", "version": 1,
  "exported_at": "2026-10-07T09:12:00Z", "app_version": "1.6.0",
  "tenant_id": "01J…T", "outlet_id": "01J…O1", "device_id": "01J…D1", "device_code": "A",
  "events": [ { "id": "01J…E1", "type": "order.placed", "aggregate_id": "01J…", "occurred_at": "…", "payload": { } } ],
  "checksum": "sha256-hex dari JSON kanonik `events`" }
```

Nama file: `poslite-export-BDG01A-20261007-1612.json`.

### Device

- Settings → Sync → **Export data darurat** (approval PIN manajer). Bekerja offline; tidak menghapus apa pun dari outbox.
- Tetap tersedia setelah device dicabut (outbox dipertahankan — [03](./03-offline-sync.md#offline-auth)).

### Server

| Langkah | Gagal → |
|---|---|
| Ukuran ≤ 10 MB, `format` \& `version` dikenal | 422 `EXPORT_INVALID` |
| Checksum cocok | 422 `EXPORT_CHECKSUM_MISMATCH` |
| `tenant_id` = tenant user | 422 `EXPORT_WRONG_TENANT` |
| Device milik tenant \& outlet di file (device yang dicabut **boleh**) | 422 `EXPORT_DEVICE_UNKNOWN` |
| User punya scope atas outlet dan permission `sync.import` | 403 `OUTLET_FORBIDDEN` |
| Proses per 50 event lewat `PushEventsHandler` | hasil per event seperti push |

Respons: `{ import_id, accepted, duplicate, flagged, rejected: [{ id, code }] }`. Disimpan di `device_imports (id, device_id, imported_by, file_sha256, accepted, duplicate, flagged, rejected, created_at)` + `audit_logs`.

### Back-office

Halaman **Import Data Darurat** (menu Perangkat): unggah file → ringkasan hasil → daftar event `rejected` dengan kodenya. Riwayat import per device.

---

## Testing Fase 6 (fitur trial)

| Level | Kasus |
|---|---|
| Unit web \& API | `refund-cases.json` (alokasi, refund bertahap), aturan void, rumus kas shift dengan void \& refund, `moveBill` |
| Contract | `sync-events.json` + varian `order.voided`, `order.refunded`; Zod \& Pydantic |
| E2E API | void → laporan berkurang di tanggal order; refund → laporan di tanggal refund; `REFUND_EXCEEDS_ORDER` dari dua device; metode bayar nonaktif dikirim `delete` di pull; import file yang sama dua kali → semua `duplicate`; import file tenant lain ditolak |
| E2E web (offline) | jual → void → tutup shift (kas cocok); refund sebagian order kemarin; pindah meja; export file |
| Full-stack | jual + void + refund offline → online → server tanpa flag, laporan \& kas shift cocok |