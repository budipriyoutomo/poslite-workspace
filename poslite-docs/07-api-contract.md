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
| 429 | Rate limit |

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
    "token": "1|abc…",
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
                  "image_url": "https://…", "is_available": true, "modifier_group_ids": ["01J…"] } },
      { "entity": "user", "op": "upsert", "id": "01J…", "version": 1043,
        "data": { "name": "Siti", "role": "cashier", "pin_hash": "base64…", "pin_salt": "base64…", "pin_iterations": 310000 } },
      { "entity": "product", "op": "delete", "id": "01J…", "version": 1044 }
    ],
    "next_cursor": 1044,
    "has_more": false,
    "server_time": "2026-09-25T04:03:10Z"
} }
```

Entity: `outlet_setting`, `category`, `product`, `modifier_group`, `modifier_option`, `payment_method`, `user`.

Isi `data` per entity (`op: "delete"` tidak membawa `data`):

| Entity | `data` |
|---|---|
| `outlet_setting` | `code`, `name`, `timezone`, `business_day_cutoff` (`"HH:MM"`), `tax_rate_bps`, `service_rate_bps`, `receipt_header`, `receipt_footer` — hanya outlet milik device |
| `category` | `name`, `sort_order`, `print_role` |
| `product` | `category_id`, `sku`, `name`, `price`, `image_url`, `is_available`, `modifier_group_ids` |
| `modifier_group` | `name`, `min_select`, `max_select` |
| `modifier_option` | `modifier_group_id`, `name`, `price`, `sort_order` |
| `payment_method` | `type`, `name`, `requires_reference`, `sort_order`, `logo_url` |
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
      "order_type": "take_away",
      "lines": [
        { "id": "01J…L1", "product_id": "01J…P1", "product_name": "Nasi Gudeg", "category_name": "Makanan",
          "unit_price": 25000, "quantity": 2, "notes": "tidak pedas",
          "modifiers": [ { "modifier_option_id": "01J…M1", "name": "Tambah Ayam", "price": 10000 } ] }
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
| `flagged` | **Tersimpan**, tapi ditandai untuk audit. `flags`: `TOTAL_MISMATCH` (hitungan server dengan tarif snapshot berbeda), `RATES_OUTDATED` (tarif snapshot ≠ tarif outlet saat ini) | Hapus dari outbox |
| `rejected` | Tidak tersimpan (+ `code`, mis. `CASHIER_NOT_IN_OUTLET`, `SHIFT_NOT_FOUND`, `SCHEMA_INVALID`) | Tandai `dead`; manager bisa kirim ulang setelah diperbaiki — server memproses ulang event yang sebelumnya `rejected` |

- Device diidentifikasi dari token (dicocokkan dengan header `X-Device-Id`); body **tidak** membawa `device_id`.
- `rates` wajib di `order.placed`. Server menghitung ulang `totals` memakai `rates` ini, bukan tarif outlet saat ini (ADR-011).
- Error non-bisnis (5xx) berarti **seluruh batch** di-rollback → device retry batch yang sama; idempotency menjamin tidak ada duplikat.

Tipe event MVP: `shift.opened`, `shift.closed`, `cash.moved`, `order.placed`, `order.voided` (belum diproses: dijawab `rejected` `UNSUPPORTED_EVENT_TYPE` sampai fitur void ada).

Kode `rejected` yang dipakai server: `SCHEMA_INVALID` (payload melanggar kontrak — divalidasi per event), `CASHIER_NOT_IN_OUTLET`, `SHIFT_NOT_FOUND` (tidak ada / milik device lain), `SHIFT_ALREADY_EXISTS`, `SHIFT_ALREADY_CLOSED`, `SHIFT_CLOSED`, `VARIANCE_MISMATCH`, `INVALID_AMOUNT`, `ORDER_WITHOUT_LINES`, `ORDER_WITHOUT_PAYMENT`, `PAYMENT_INSUFFICIENT`, `NON_CASH_EXCEEDS_TOTAL`, `ORDER_ALREADY_EXISTS`, `ID_CONFLICT` (id sudah dipakai, termasuk oleh tenant lain), `RECEIPT_NO_TAKEN`. Kontrak payload diuji dua sisi dengan fixture bersama `tests/fixtures/sync-events.json` (Zod di web, Pydantic di API).

Payload event lain (Zod `features/sync/infrastructure/event-payloads.ts`; `aggregate_id` = id shift / cash movement / order):

```json
// shift.closed
{ "closed_by": "01J…U1", "counted_cash": 330000, "expected_cash": 337500, "variance": -7500 }
// cash.moved (aggregate_id = id cash movement)
{ "shift_id": "01J…S1", "type": "out", "amount": 20000, "reason": "Beli es batu", "created_by": "01J…U1" }
// order.voided (Fase berikutnya)
{ "reason": "Salah input", "voided_by": "01J…U1", "approved_by": "01J…U2" }
```

`business_date` **tidak** dikirim: server menurunkannya dari `occurred_at` + `timezone` & `business_day_cutoff` outlet (aturan yang sama dengan device).

Batas: maks 50 event / request, body maks 1 MB.

## Endpoint — Back-office (online)

| Method | Path | Keterangan |
|---|---|---|
| POST | `/tenants/signup` | Publik (rate limit ketat): buat tenant + owner + outlet pertama → token back-office |
| POST | `/auth/login` · `/auth/logout` | Owner/manager; response memuat `tenant` (id, slug, name, status) |
| GET/POST/PUT/DELETE | `/outlets`, `/outlets/{id}` | |
| GET/DELETE | `/outlets/{id}/devices`, `/devices/{id}` (revoke) | |
| GET/POST/PUT/DELETE | `/users`, `/users/{id}`; `PUT /users/{id}/pin` | |
| GET/POST/PUT/DELETE | `/categories`, `/products`, `/modifier-groups`, `/payment-methods` | |
| PUT | `/outlets/{id}/products/{productId}` | harga & ketersediaan per outlet |
| GET | `/orders?outlet_id=&business_date=` → `[{id, receipt_no, business_date, cashier_id, total, status, flags, created_at}]` · `/orders/{id}` (belum) | |
| GET | `/shifts?outlet_id=&business_date=` · `/shifts/{id}` | |
| GET | `/reports/sales-summary?outlet_id=&from=&to=` | dari read model |
| GET | `/reports/products`, `/reports/categories`, `/reports/payment-methods`, `/reports/cashiers` | |
| POST | `/imports/device-export` | import file export darurat dari device |

## Endpoint — Platform Admin (operator SaaS)

| Method | Path | Keterangan |
|---|---|---|
| GET | `/platform/tenants?status=` · `/platform/tenants/{id}` | Daftar & detail tenant |
| POST | `/platform/tenants/{id}/suspend` · `/platform/tenants/{id}/activate` | Ubah status tenant |

Semua endpoint lain otomatis ter-scope ke tenant dari token; **tidak ada** parameter `tenant_id` di URL/body tenant API.

Endpoint `lib/api.ts` di prototype (`/auth/login` dengan PIN, `POST /transactions`) **diganti** oleh aktivasi device + `/sync/push` — PIN tidak lagi dikirim ke server.

## Kontrak Tipe

- Backend: OpenAPI bawaan FastAPI (`/openapi.json`) di-export ke `openapi.json` dan di-commit di repo API. Semua schema Pydantic wajib punya `description` & contoh.
- Frontend: `npx openapi-typescript openapi.json -o src/shared/api/schema.d.ts` di CI.
- Payload event juga didefinisikan sebagai **Zod schema** di frontend (validasi sebelum masuk outbox) dan **Pydantic model** di backend — keduanya dites dengan fixture JSON yang sama.
