# 07 — API Contract (v1)

Base URL: `https://api.<domain>/api/v1` · JSON · snake_case · uang = integer Rupiah · waktu = ISO 8601 UTC.

## Konvensi Response

```json
// sukses
{ "data": { }, "message": "OK", "meta": { } }

// error
{ "message": "Validation failed", "code": "VALIDATION_ERROR", "errors": { "field": ["..."] } }
```

| HTTP | Kapan |
|---|---|
| 200/201 | Sukses |
| 401 | Token tidak valid / device di-revoke → device harus aktivasi ulang |
| 403 | Tidak punya ability/permission, atau `TENANT_SUSPENDED` (write back-office saat tenant di-suspend) |
| 409 | Konflik (mis. device code sudah dipakai) |
| 422 | Validasi |
| 426 | `app_version` device terlalu lama → wajib update PWA |
| 429 | `RATE_LIMITED` + header `Retry-After` (detik) — terlalu banyak percobaan di endpoint publik (ADR-027) |

Header wajib dari device: `Authorization: Bearer <device_token>`, `X-App-Version: 1.4.0`, `X-Device-Id: <ulid>`.

## Endpoint — POS Device

### Aktivasi

`POST /devices/activate` (tanpa token device; kredensial manager)

```json
// request
{ "email": "manager@resto.id", "password": "••••", "outlet_id": "01J…", "device_name": "Kasir Depan", "platform": "android" }
// response 201
{ "data": {
    "device": { "id": "01J…", "code": "A", "outlet": { "id": "01J…", "code": "JKT01", "name": "Outlet Kemang" } },
    "token": "kQ3x…",  // secrets.token_urlsafe(32), disimpan di server sebagai SHA-256
    "server_time": "2026-09-25T04:03:00Z"
} }
```

`GET /devices/me` → info device & outlet (juga dipakai sebagai health check).

### Pull

`GET /sync/pull?cursor=0&limit=500`

```json
{ "data": {
    "changes": [
      { "entity": "product", "op": "upsert", "id": "01J…", "version": 1042,
        "data": { "category_id": "01J…", "sku": "NG-001", "name": "Nasi Gudeg", "price": 25000,
                  "image_key": "01J…T/products/01J….jpg", "is_available": true, "modifier_group_ids": ["01J…"] } },
      { "entity": "user", "op": "upsert", "id": "01J…", "version": 1043,
        "data": { "name": "Siti", "role": "cashier", "pin_hash": "base64…", "pin_salt": "base64…", "pin_iterations": 310000 } },
      { "entity": "product", "op": "delete", "id": "01J…", "version": 1044 }
    ],
    "next_cursor": 1044,
    "has_more": false,
    "server_time": "2026-09-25T04:03:10Z",
    "media_base_url": "https://is3.cloudhost.id/poslite-media"
} }
```

URL gambar = `media_base_url` + `/` + `image_key` (ADR-021); `image_key` yang sudah berupa URL penuh (`://`) dipakai apa adanya. `media_base_url` dikirim di setiap halaman, jadi ganti vendor S3 langsung terbawa di pull berikutnya.

Entity: `outlet_setting`, `category`, `product`, `modifier_group`, `modifier_option`, `payment_method`, `user`, `dining_table`, `promotion`.

Isi `data` per entity (`op: "delete"` tidak membawa `data`):

| Entity | `data` |
|---|---|
| `outlet_setting` | `code`, `name`, `timezone`, `business_day_cutoff` (`"HH:MM"`), `tax_rate_bps`, `service_rate_bps`, `receipt_header`, `receipt_footer` (sudah di-resolve: teks outlet bila diisi, selain itu teks brand), `brand` `{id, code, name, logo_key}`, `discount_policy` `{percentages, amounts, allow_custom, cashier_max_percentage, cashier_max_amount}` (dari brand; opsional untuk server lama) — hanya outlet milik device. Katalog (`category`, `product`, `modifier_group`, `modifier_option`) dan `promotion` hanya milik brand outlet (ADR-022) |
| `category` | `name`, `sort_order`, `print_role` |
| `product` | `category_id`, `sku`, `name`, `price`, `image_key`, `is_available`, `modifier_group_ids` |
| `modifier_group` | `name`, `min_select`, `max_select` |
| `modifier_option` | `modifier_group_id`, `name`, `price`, `sort_order` |
| `payment_method` | `type`, `name`, `requires_reference`, `sort_order`, `logo_url` — `upsert` hanya bila outlet device memakai metode itu, selain itu `delete` (doc 11 §3) |
| `dining_table` | `label`, `area`, `seats`, `sort_order` — hanya meja outlet device |
| `promotion` | `name`, `type` (`percent_off`\|`buy_x_get_y`), `percentage`, `buy_qty`, `get_qty`, `product_ids`, `category_ids`, `days_of_week`, `start_time`, `end_time`, `starts_on`, `ends_on` — hanya promo aktif yang berlaku di outlet device; promo nonaktif/dihapus/di luar outlet dikirim sebagai `delete` |
| `user` | `name`, `role` (di outlet device), `pin_hash`, `pin_salt`, `pin_iterations` — user yang dihapus, nonaktif, atau tidak lagi punya role di outlet device dikirim sebagai `delete` |

`next_cursor` = `version` terakhir di halaman ini. Urutan `version` dijamin sama dengan urutan commit (ADR-009), jadi device cukup menyimpan satu angka.

### Push

`POST /sync/push`

```json
// request
{ "events": [
  { "id": "01J8Z…E1", "type": "shift.opened", "aggregate_id": "01J8Z…S1", "occurred_at": "2026-09-25T01:00:00Z",
    "payload": { "opening_cash": 500000, "opened_by": "01J…U1" } },
  { "id": "01J8Z…E2", "type": "order.placed", "aggregate_id": "01J8Z…O1", "occurred_at": "2026-09-25T04:03:00Z",
    "payload": {
      "shift_id": "01J8Z…S1", "receipt_no": "JKT01A-260925-0042", "cashier_id": "01J…U1",
      "order_type": "take_away", "table_label": null,
      "lines": [
        { "id": "01J…L1", "product_id": "01J…P1", "product_name": "Nasi Gudeg", "category_name": "Makanan",
          "unit_price": 25000, "quantity": 2, "notes": "tidak pedas",
          "modifiers": [ { "modifier_option_id": "01J…M1", "name": "Tambah Ayam", "price": 10000 } ],
          "discount": null, "promotion": null }
      ],
      "discount": { "type": "percentage", "value": 10 },
      "rates": { "service_bps": 500, "tax_bps": 1000 },
      "totals": { "subtotal": 70000, "discount_amount": 7000, "service_charge": 3150, "tax": 6615, "total": 72765 },
      "payments": [
        { "id": "01J…Y1", "payment_method_id": "01J…CASH", "method_type": "cash", "amount": 100000, "reference": null }
      ],
      "change_amount": 27235
  } }
] }
```

`payments[].reference` maksimal 64 karakter (atau `null`); lebih panjang → event `rejected` dengan `SCHEMA_INVALID`.

```json
// response 200 — hasil per event (contoh ilustrasi semua status)
{ "data": { "results": [
  { "id": "01J8Z…E1", "status": "accepted" },
  { "id": "01J8Z…E2", "status": "flagged", "flags": ["RATES_OUTDATED"] },
  { "id": "01J8Z…E3", "status": "rejected", "code": "CASHIER_NOT_IN_OUTLET", "message": "…" }
] } }
```

| Status | Arti | Tindakan device |
|---|---|---|
| `accepted` | Tersimpan | Hapus dari outbox |
| `duplicate` | Sudah pernah `accepted`/`flagged` sebelumnya | Hapus dari outbox (anggap sukses) |
| `flagged` | **Tersimpan**, tapi ditandai untuk audit. `flags`: `TOTAL_MISMATCH` (hitungan server dengan tarif snapshot berbeda), `RATES_OUTDATED` (tarif snapshot ≠ tarif outlet saat ini), `QRIS_UNPAID` (referensi pembayaran QRIS adalah charge dinamis yang belum dikonfirmasi gateway, ADR-019), `PAYMENT_METHOD_INACTIVE` (metode bayar tidak aktif di outlet, doc 11 §3), `REFUND_EXCEEDS_ORDER` (qty refund melebihi sisa, mis. dua device), `REFUND_ON_VOIDED` (refund atas order yang sudah di-void), `DISCOUNT_UNAPPROVED` (diskon manual di atas batas kasir brand tanpa `discount_approved_by` yang punya `discount.override`) | Hapus dari outbox |
| `rejected` | Tidak tersimpan (+ `code`, mis. `CASHIER_NOT_IN_OUTLET`, `SHIFT_NOT_FOUND`, `SCHEMA_INVALID`) | Tandai `dead`; manager bisa kirim ulang setelah diperbaiki — server memproses ulang event yang sebelumnya `rejected` |

- Device diidentifikasi dari token (dicocokkan dengan header `X-Device-Id`); body **tidak** membawa `device_id`.
- `table_label` (string ≤ 30, opsional) diisi untuk `order_type: dine_in`. Per baris, `discount` (`{type, value}` atau `null`) dan `promotion` (`{id, name}` snapshot promo yang memberi diskon itu, atau `null`) bersifat opsional — device lama tanpa field ini tetap valid. Rumus total dengan diskon baris: 06 "Order" aturan 8–9 (ADR-016).
- `discount_approved_by` (ULID atau null, opsional) di `order.placed`: manajer yang menyetujui diskon di atas batas kasir brand (06 aturan 5).
- `rates` wajib di `order.placed`. Server menghitung ulang `totals` memakai `rates` ini, bukan tarif outlet saat ini (ADR-011).
- Error non-bisnis (5xx) berarti **seluruh batch** di-rollback → device retry batch yang sama; idempotency menjamin tidak ada duplikat.

Tipe event: `shift.opened`, `shift.closed`, `cash.moved`, `order.placed`, `order.voided`, `order.refunded` (ADR-023), `bill.item_voided` (ADR-028). Tipe lain → `rejected` `UNSUPPORTED_EVENT_TYPE`.

Kode `rejected` yang dipakai server: `SCHEMA_INVALID` (payload melanggar kontrak — divalidasi per event), `CASHIER_NOT_IN_OUTLET`, `SHIFT_NOT_FOUND` (tidak ada / milik device lain), `SHIFT_ALREADY_EXISTS`, `SHIFT_ALREADY_CLOSED`, `SHIFT_CLOSED`, `VARIANCE_MISMATCH`, `INVALID_AMOUNT`, `ORDER_WITHOUT_LINES`, `ORDER_WITHOUT_PAYMENT`, `PAYMENT_INSUFFICIENT`, `NON_CASH_EXCEEDS_TOTAL`, `ORDER_ALREADY_EXISTS`, `ID_CONFLICT` (id sudah dipakai, termasuk oleh tenant lain), `RECEIPT_NO_TAKEN`; koreksi (ADR-023): `ORDER_NOT_FOUND` (bukan order outlet ini), `ORDER_ALREADY_VOIDED`, `VOID_NOT_ALLOWED` (device lain, shift order sudah tutup, atau sudah ada refund), `APPROVER_NOT_ALLOWED` (penyetuju — atau kasir itu sendiri bila `approved_by` null — tidak punya `order.void`/`order.refund` di outlet), `REFUND_INVALID_LINE`, `REFUND_PAYMENT_MISMATCH`, `REFUND_NO_TAKEN`. `bill.item_voided` (ADR-028) hanya bisa ditolak karena kontrak, `CASHIER_NOT_IN_OUTLET`, `APPROVER_NOT_ALLOWED` (`order.void`), atau `SHIFT_NOT_FOUND`. Kontrak payload diuji dua sisi dengan fixture bersama `tests/fixtures/sync-events.json`, `correction-events.json`, dan `bill-void-events.json` (Zod di web, Pydantic di API).

Payload event lain (Zod `features/sync/infrastructure/event-payloads.ts`; `aggregate_id` = id shift / cash movement / order):

```json
// shift.closed
{ "closed_by": "01J…U1", "counted_cash": 330000, "expected_cash": 337500, "variance": -7500 }
// cash.moved (aggregate_id = id cash movement)
{ "shift_id": "01J…S1", "type": "out", "amount": 20000, "reason": "Beli es batu", "created_by": "01J…U1" }
// order.voided (aggregate_id = order id; approved_by null bila kasirnya sendiri manajer)
{ "reason": "Salah input", "voided_by": "01J…U1", "approved_by": "01J…U2" }
// order.refunded (aggregate_id = refund id; amount per baris = alokasi bersama refund-cases.json)
{ "order_id": "01J…O1", "shift_id": "01J…S2", "refund_no": "BDG01A-R261007-0003", "reason": "Pelanggan komplain",
  "refunded_by": "01J…U1", "approved_by": "01J…U2",
  "lines": [ { "order_line_id": "01J…L1", "quantity": 1, "amount": 36383 } ], "total": 36383,
  "payments": [ { "id": "01J…RP1", "payment_method_id": "01J…CASH", "method_type": "cash", "method_name": "Tunai", "amount": 36383, "reference": null } ] }
// bill.item_voided (aggregate_id = id void; satu event per aksi; amount = unit_price × quantity, unit_price termasuk pilihan)
{ "bill_id": "01J…B1", "scope": "line", "table_label": "A3", "shift_id": "01J…S1",
  "cashier_id": "01J…U1", "approved_by": "01J…U2", "reason": "Pelanggan batal",
  "lines": [ { "product_id": "01J…P1", "product_name": "Nasi Gudeg", "modifiers": ["Tambah Ayam"], "unit_price": 35000, "quantity": 1, "amount": 35000 } ] }
```

`business_date` **tidak** dikirim: server menurunkannya dari `occurred_at` + `timezone` & `business_day_cutoff` outlet (aturan yang sama dengan device).

Batas: maks 50 event / request, body maks 1 MB.

## Endpoint — Back-office (online)

### Akses brand & outlet (ADR-022)

- Isolasi antar perusahaan tetap RLS. Di dalam perusahaan, setiap endpoint back-office memeriksa `AccessScope` user (dari `user_assignments`; hanya role `owner`/`manager` yang dihitung).
- **Brand aktif** dikirim di header `X-Brand-Id`.
  - Endpoint tingkat brand (menu, promo, unggah gambar) wajib header: tidak ada → 422 `BRAND_REQUIRED`; brand di luar scope → 403 `BRAND_FORBIDDEN`.
  - Baca menu: scope perusahaan, brand, atau outlet di brand itu. Ubah menu/promo: hanya scope perusahaan atau brand (manajer outlet → 403 `BRAND_FORBIDDEN`).
  - Baris milik brand lain → 404 (`CATEGORY_NOT_FOUND`, `PRODUCT_NOT_FOUND`, …).
- **Outlet** di luar scope, atau bukan milik brand di `X-Brand-Id` (bila dikirim) → 403 `OUTLET_FORBIDDEN`. Berlaku untuk pengaturan outlet, meja, perangkat, harga per outlet, order, dan laporan.
- Relasi lintas brand (produk ↔ kategori/grup pilihan, promo ↔ produk/kategori/outlet, harga outlet ↔ produk) → 422 `CROSS_BRAND_REFERENCE`.
- **Halaman perusahaan** (users, metode bayar, webhook, langganan) hanya untuk scope perusahaan → 403 `COMPANY_SCOPE_REQUIRED`.

| Method | Path | Keterangan |
|---|---|---|
| POST | `/tenants/signup` | Publik (rate limit ketat): buat perusahaan + owner (scope `company`) + brand pertama + outlet pertama → token back-office |
| POST | `/auth/login` · `/auth/logout` | Owner/manager; response memuat `tenant` (id, slug, name, status) |
| GET | `/me/access` | Pohon akses: `{tenant, company_scope, brands: [{id, code, name, role, outlets: [{id, code, name, role}]}]}`. `role` brand `null` = hanya akses ke sebagian outletnya |
| GET | `/outlets?brand_id=` | Outlet dalam scope (opsional satu brand); item memuat `brand_id` |
| POST · GET/PUT | `/outlets` · `/outlets/{id}` | Tambah outlet: body wajib `brand_id`, butuh scope perusahaan/brand itu (`BRAND_FORBIDDEN`). Outlet tidak bisa pindah brand |
| GET/POST · PUT/DELETE | `/brands` · `/brands/{id}` | Perusahaan. `{code, name, logo_key, receipt_header, receipt_footer, is_active, discount: {percentages, amounts, allow_custom, cashier_max_percentage, cashier_max_amount}}`; respons + `logo_url`. Kode unik per perusahaan → 409 `BRAND_CODE_TAKEN`; logo = key dari `/media/images` milik perusahaan (`INVALID_IMAGE_KEY`); ubah brand men-*touch* `outlets.version` brand itu; hapus brand dengan outlet aktif → 409 `BRAND_HAS_OUTLETS` |
| GET/DELETE | `/outlets/{id}/devices`, `/devices/{id}` (revoke) | |
| GET/POST/PUT/DELETE | `/categories`, `/products`, `/modifier-groups` | Tingkat brand (`X-Brand-Id`) |
| PUT | `/outlets/{id}/products/{productId}` | harga & ketersediaan per outlet; produk harus brand outlet |
| POST | `/media/images` (body = file mentah, `Content-Type: image/jpeg\|png\|webp`) | Tingkat brand. Unggah gambar produk (ADR-021): jenis dari magic bytes, maks 2 MB (`UNSUPPORTED_IMAGE`, `IMAGE_TOO_LARGE`). Respons `{key, url}`; simpan `key` di produk sebagai `image_key`. Produk menjawab `image_key` + `image_url` (dirangkai); `image_key` milik tenant lain → `INVALID_IMAGE_KEY` |
| GET/POST · PUT/DELETE | `/outlets/{id}/tables` · `/tables/{id}` | meja per outlet; label unik per outlet → 409 `TABLE_LABEL_TAKEN` |
| GET/POST/PUT/DELETE | `/promotions`, `/promotions/{id}` | Tingkat brand. Promo yang dipilih kasir di layar bayar (ADR-016) |
| GET | `/orders?outlet_id=&business_date=` → `[{id, receipt_no, business_date, cashier_id, total, status, flags, created_at}]` · `/orders/{id}` | Detail: baris (+ `refunded_quantity`), pilihan, pembayaran, `void` (atau null), `refunds` |
| GET | `/refunds?outlet_id=&business_date=` · `/refunds/{id}` | Refund di hari refund (ADR-023); detail memuat baris & pembayaran |
| GET | `/shifts?outlet_id=&business_date=` → `[{id, device_id, device_name, business_date, status, opened_by, opened_by_name, opened_at, opening_cash, closed_by, closed_by_name, closed_at, expected_cash, counted_cash, variance}]` · `/shifts/{id}` | Detail + `cash_movements: [{id, type, amount, reason, created_by, created_by_name, created_at}]`; tidak ada / milik tenant lain → 404 `SHIFT_NOT_FOUND` |
| GET · POST · GET | `/day-closings/day?outlet_id=&business_date=` · `/day-closings` `{outlet_id, business_date, notes}` · `/day-closings?outlet_id=&from=&to=` | Tutup hari (ADR-026, [13](./13-day-closing.md)). `day`: `{outlet_id, business_date, day_ended, current: snapshot, closing: {id, closed_by, closed_by_name, closed_at, notes, snapshot} \| null, changed_since_close}`. POST butuh `backoffice:write`, hari belum berakhir → 422 `DAY_NOT_ENDED`, sudah ditutup → 409 `DAY_ALREADY_CLOSED`; 201 `closing`. Snapshot `{totals, payment_methods, cash, warnings}`, peringatan `OPEN_SHIFTS` / `DEVICES_NOT_SYNCED` tidak memblok |
| GET | `/reports/sales-summary?from=&to=[&brand_id=][&outlet_id=]` · `/reports/sales-summary/export?…&format=csv\|xlsx` | dari read model; satu respons memuat `days`, `totals` (termasuk `pre_payment_void_count`/`pre_payment_void_amount`, ADR-028 — tidak mengurangi `net`), `payment_methods`, `products`, `categories`, `cashiers`. Tanpa filter = semua outlet dalam scope (konsolidasi perusahaan untuk scope `company`); `brand_id` di luar scope → 403 `BRAND_FORBIDDEN`. Nama file: kode outlet, kode brand, atau `semua` |
| GET | `/reports/bill-voids?from=&to=[&brand_id=][&outlet_id=]` | Batal item bill setelah masuk dapur (ADR-028), terbaru dulu: `{voids: [{id, outlet_id, business_date, voided_at, bill_id, scope, table_label, cashier_id, cashier_name, approved_by, approver_name, reason, amount, lines[]}], totals: {count, amount}}`. Scope sama dengan ringkasan penjualan; outlet perusahaan lain → 404 |
| POST · GET | `/imports/device-export` · `/imports?device_id=` | Import darurat (ADR-024): body = isi file JSON (maks 10 MB). Urutan cek: format/versi → 422 `EXPORT_INVALID`; checksum → 422 `EXPORT_CHECKSUM_MISMATCH`; `tenant_id` (opsional; device tidak tahu id perusahaannya) → 422 `EXPORT_WRONG_TENANT`; scope + permission `sync.import` atas outlet di file → 403 `OUTLET_FORBIDDEN`; device milik outlet itu (yang dicabut boleh) → 422 `EXPORT_DEVICE_UNKNOWN`. Respons `{import_id, device_id, accepted, duplicate, flagged, rejected: [{id, code}]}`; riwayat per device |
| GET/POST/PUT/DELETE | `/users`, `/users/{id}`; `PUT /users/{id}/pin` | Perusahaan. Email global (login): sudah dipakai → 409 `EMAIL_TAKEN`. POST memuat `assignments` (atau `outlets` lama, deprecated — tepat salah satu); respons memuat `assignments` + `outlets` (role per outlet yang dicakup). PUT tanpa `outlets` hanya mengubah nama/status. Menonaktifkan atau menghapus owner aktif terakhir → 409 `LAST_OWNER`; menghapus akun sendiri → 409 `CANNOT_DELETE_SELF` |
| GET · PUT | `/users/{id}/assignments` | Perusahaan. `[{role, scope_type, brand_id, outlet_id}]`; PUT `{assignments: [...]}` mengganti semua. Owner hanya `company`, kasir bukan `company`, bentuk id sesuai scope → 422 `INVALID_ASSIGNMENT`; `brand_id` scope outlet boleh kosong (diisi dari outlet), beda brand → 422 `CROSS_BRAND_REFERENCE`; owner aktif terakhir tidak bisa dicabut → 409 `LAST_OWNER` |
| GET/POST/PUT/DELETE · PUT | `/payment-methods` · `/payment-methods/{id}/outlets` | Perusahaan. Item memuat `outlet_ids`; POST tanpa `outlet_ids` = semua outlet; PUT `{outlet_ids}` mengganti outlet yang memakai metode itu (outlet tak dikenal → 404 `OUTLET_NOT_FOUND`), device outlet lain menerima `delete` di pull. Outlet baru otomatis memakai semua metode |
| GET | `/billing/subscription` | Perusahaan. Status langganan, trial, tagihan + `payment_url` (ADR-018) |
| GET/POST/DELETE | `/webhooks`, `/webhooks/{id}`; GET `/webhooks/{id}/deliveries`; POST `/webhook-deliveries/{id}/retry` | Perusahaan. Webhook keluar (ADR-020); `event_types`: `order.placed`, `shift.closed`, `order.voided`, `order.refunded`, `bill.item_voided`; `secret` hanya di respons POST. `brand_ids` (kosong = semua brand) membatasi event ke brand tertentu; brand tak dikenal → 404 `BRAND_NOT_FOUND`. Data event memuat `brand_id` |

## Endpoint — Device (online saja)

| Method | Path | Keterangan |
|---|---|---|
| POST | `/payments/qris` `{id, amount}` | QR dinamis (ADR-019); `id` ULID dari device → idempoten. Respons `{id, amount, status, qr_string, expires_at, paid_at}` |
| GET | `/payments/qris/{id}` | dipolling device sampai `status` bukan `pending`: `paid`, atau `expired` bila belum dibayar setelah `expires_at` (pembayaran yang dikonfirmasi gateway setelahnya tetap menjadi `paid`) |
| GET | `/orders/lookup?receipt_no=` | Ability `device:read`. Order outlet device (dari device mana pun) + `refunded_quantity` per baris, untuk refund lintas device saat online (ADR-023); tidak ada → 404 `ORDER_NOT_FOUND` |

## Endpoint — Gateway (masuk)

| Method | Path | Keterangan |
|---|---|---|
| POST | `/gateway/webhook` | notifikasi gateway, tanda tangan wajib valid (401 `INVALID_SIGNATURE`); idempoten; referensi tak dikenal tetap 200 |
| GET/POST | `/gateway/fake/pay/{ref}` | hanya `PAYMENT_GATEWAY=fake`: checkout simulasi untuk dev/e2e |

## Endpoint — Platform Admin (operator SaaS)

Dipakai oleh app `poslite-operator` (ADR-025) dengan token operator; token tenant tidak berlaku di sini, dan token operator tidak berlaku di endpoint tenant.

| Method | Path | Keterangan |
|---|---|---|
| POST | `/platform/auth/login` | Email + password operator → `{token, expires_at}` (8 jam); salah atau operator nonaktif → 401 `INVALID_CREDENTIALS` |
| GET | `/platform/me` | Operator yang sedang login `{id, email, name, created_at, disabled_at}` |
| GET · POST | `/platform/operators` | Daftar operator · tambah `{email, name, password}` (password ≥ 12) → 201; email dipakai → 409 `OPERATOR_EMAIL_TAKEN` |
| POST | `/platform/operators/{id}/disable` · `/enable` | Nonaktifkan = semua token operator itu dicabut & login ditolak; diri sendiri → 409 `CANNOT_DISABLE_SELF`; tak dikenal → 404 `OPERATOR_NOT_FOUND` |
| GET | `/platform/summary` | Jumlah tenant (aktif/ditangguhkan), langganan (`trialing`/`active`/`past_due`), outlet & perangkat aktif, `monthly_recurring_revenue` (tagihan terakhir tiap langganan aktif), `open_invoice_amount` — Rupiah integer |
| GET | `/platform/tenants?status=active\|suspended&q=&limit=50&offset=0` | Daftar tenant terbaru dulu: jumlah outlet & perangkat, status langganan, `suspended_reason` (`manual`/`billing`). `q` mencocokkan nama, slug, atau email user tenant. `meta: {total, limit, offset}`; `limit` 1–200 |
| GET | `/platform/tenants/{id}` | Detail: field daftar + `owners`, `outlets` (brand, jumlah perangkat), `users` (`roles`, `has_login`, `is_active`), `devices` (termasuk yang dicabut), `subscription` (`null` sebelum job billing pertama), `invoices`; tak dikenal → 404 `TENANT_NOT_FOUND` |
| POST | `/platform/tenants/{id}/suspend` · `/platform/tenants/{id}/activate` | Suspend = `suspended_reason: manual`; aktifkan menghapus suspend apa pun, termasuk karena billing (pembayaran hanya mengaktifkan suspend `billing`, ADR-018) |
| POST | `/platform/tenants/{id}/extend-trial` `{days: 1..90}` | Tambah hari ke akhir trial → `{trial_ends_at}`; sebelum job billing pertama langganan dimulai di sini (trial dari tanggal daftar); sudah bukan trial → 409 `TRIAL_NOT_ACTIVE` |
| POST | `/platform/invoices/{id}/mark-paid` | Tagihan dibayar di luar gateway (transfer bank): efek sama dengan webhook gateway (periode diperpanjang, suspend `billing` dicabut bila tak ada tagihan terbuka lain); bukan `open` → 409 `INVOICE_ALREADY_PAID`; tak dikenal → 404 `INVOICE_NOT_FOUND` |
| GET | `/platform/users?q=` (min. 2 huruf) | User semua tenant berdasarkan nama/email (maks. 50) dengan `tenant_id`, `tenant_name`, `tenant_slug`, `roles` |
| POST | `/platform/tenants/{tid}/users/{uid}/reset-password` | Password sementara `{password}` (ditampilkan sekali, tidak disimpan/di-log); semua token user dicabut. User PIN saja → 409 `USER_HAS_NO_LOGIN`; user tenant lain → 404 `USER_NOT_FOUND` (berjalan di transaksi tenant, RLS) |
| POST | `/platform/tenants/{tid}/users/{uid}/deactivate` · `/activate` | Nonaktifkan = token user dicabut; owner aktif terakhir → 409 `LAST_OWNER` |
| GET | `/platform/audit?tenant_id=&limit=50&offset=0` | Audit log aksi operator, terbaru dulu: `action`, `operator_name`, `tenant_name`, `target_id`, `detail`; `meta: {total, limit, offset}` |

Setiap aksi yang mengubah data (suspend/aktifkan tenant, perpanjang trial, tandai lunas, reset password, (non)aktifkan user, tambah/(non)aktifkan operator) tercatat di `platform_audit_log`. Kode aksi: `tenant.suspend`, `tenant.activate`, `subscription.extend_trial`, `invoice.mark_paid`, `user.reset_password`, `user.deactivate`, `user.activate`, `operator.create`, `operator.disable`, `operator.enable`.

Semua endpoint lain otomatis ter-scope ke tenant dari token; **tidak ada** parameter `tenant_id` di URL/body tenant API.

Endpoint `lib/api.ts` di prototype (`/auth/login` dengan PIN, `POST /transactions`) **diganti** oleh aktivasi device + `/sync/push` — PIN tidak lagi dikirim ke server.

## Kontrak Tipe

- Backend: OpenAPI bawaan FastAPI (`/openapi.json`) di-export ke `openapi.json` dan di-commit di repo API. Semua schema Pydantic wajib punya `description` & contoh.
- Frontend: `npx openapi-typescript openapi.json -o src/shared/api/schema.d.ts` di CI.
- Payload event juga didefinisikan sebagai **Zod schema** di frontend (validasi sebelum masuk outbox) dan **Pydantic model** di backend — keduanya dites dengan fixture JSON yang sama.
