# 10 — Multi Perusahaan, Multi Brand, Multi Outlet

Status: **desain disetujui untuk Fase 6** (2026-10-07). **Fase 6a selesai** (6a.1–6a.6: schema, migrasi `0016`, `user_assignments`, `AccessScope`, `GET /me/access`, `X-Brand-Id`, CRUD `/brands`, `/users/{id}/assignments`, pull per brand, laporan & webhook per brand, UI back-office, brand di POS).

### Catatan implementasi 6a.1

- Brand berada di module `organization` (bersama outlet, device, meja), bukan module baru — tidak perlu kontrak import-linter tambahan.
- `brand_id` di `shifts`, `orders`, dan `rpt_*` diisi **trigger DB** `fill_brand_from_outlet()` dari outlet (`BEFORE INSERT`), bukan oleh handler. Payload device tidak pernah menentukan brand, dan handler/domain sales & shift tidak berubah. Tabel transaksi baru (mis. `refunds`) cukup memasang `fill_brand_trigger(table)`.
- Penugasan outlet harus satu brand dengan outletnya: FK komposit `(outlet_id, brand_id) → outlets (id, brand_id)`. CHECK: owner hanya scope `company`, cashier tidak boleh scope `company`.
- ~~Sementara sampai 6a.2/6a.3: data baru memakai brand pertama perusahaan~~ — selesai: menu & promo memakai `X-Brand-Id`, `POST /outlets` memakai `brand_id` di body. `/users` menerima `assignments` (dipakai back-office sejak 6a.5); bentuk lama `outlets: [{outlet_id, role}]` tetap diterima (deprecated) dan `UserOut.outlets` tetap dikirim — penugasan `company`/`brand` ditampilkan di setiap outlet yang dicakupnya; baris `owner` di outlet mana pun = owner perusahaan. `PUT /users/{id}` tanpa `outlets` tidak mengubah penugasan.
- **6a.2**: `AccessScope` (identity domain) hanya menghitung assignment `owner`/`manager`; kasir tidak punya akses back-office walau punya password. Menu & promo: **baca** boleh untuk manajer outlet di brand itu, **ubah** hanya scope perusahaan/brand. Halaman perusahaan → 403 `COMPANY_SCOPE_REQUIRED` (kode baru, belum ada di desain awal). `/auth/login` belum memuat pohon akses — back-office memanggil `GET /me/access` setelah login dan memakai brand pertama sampai pemilih brand ada (6a.5).
- **6a.3**: logo brand diunggah lewat `/media/images` yang sama dengan foto produk (key `{tenant}/products/…`); validasi hanya prefix perusahaan. Error baru `INVALID_ASSIGNMENT` (422) dan `LAST_OWNER` (409). Assignment diurutkan company → brand → outlet.
- **6a.4**: `outlets.receipt_header/footer` **tidak** dijadikan nullable — string kosong = ikut brand (tanpa migrasi; outlet tidak bisa sengaja mengosongkan header bila brand punya header). Laporan hanya mencakup outlet aktif: penjualan outlet yang sudah dihapus belum bisa dilihat (sama seperti sebelum Fase 6). Event webhook `order.placed`/`shift.closed` memuat `brand_id`; brand outlet yang sudah ditutup tetap terbaca.

## Hierarki

```
Perusahaan (tenant)          ← batas data, isolasi PostgreSQL RLS (ADR-013) — tidak berubah
 └── Brand                   ← identitas jualan: nama, logo, menu, promo sendiri
      └── Outlet             ← cabang fisik: tarif PB1/service, meja, harga per outlet, cut-off
           └── Device        ← tablet/PC kasir yang diaktivasi untuk outlet
```

- **Perusahaan = tenant.** Di kode tetap `tenant` / `tenant_id`; di UI disebut "Perusahaan". Semua aturan ADR-013 (RLS, role DB, test isolasi) tetap berlaku.
- Satu perusahaan punya ≥ 1 brand; satu brand punya ≥ 1 outlet; satu outlet milik **tepat satu** brand. Outlet tidak bisa dipindah brand (order lama menyimpan snapshot brand) — buat outlet baru.
- Satu user milik **tepat satu perusahaan** (email unik global, sama seperti sekarang). User hanya bisa membaca data perusahaannya, dan di dalamnya hanya brand/outlet yang ditugaskan kepadanya.

## ADR-022 — Brand di bawah tenant; akses brand/outlet = otorisasi aplikasi, bukan RLS

- **Keputusan**: Tambah entity `brand` di antara tenant dan outlet. Isolasi antar perusahaan tetap lewat RLS (`tenant_id`). Pembatasan brand/outlet per user ditegakkan di application layer lewat `AccessScope` (dihitung dari `user_assignments` di setiap request back-office), plus test matriks akses.
- **Kenapa**: batas perusahaan adalah batas data pelanggan SaaS yang tidak boleh bocor apa pun bug-nya → RLS. Batas brand/outlet adalah hak akses internal yang sering berubah (manajer dipindah, owner melihat semua) dan harus bisa dipakai oleh device, worker, dan laporan konsolidasi. Memasukkan scope user ke RLS berarti men-set daftar brand/outlet per transaksi dan membuat relay outbox, projector, serta sync jauh lebih rumit.
- **Alternatif ditolak**: (a) brand = tenant terpisah — owner tidak bisa melihat konsolidasi, billing \& user terduplikasi; (b) RLS kedua untuk `brand_id` — kompleks dan tidak cocok untuk device (device sudah dibatasi outlet).
- **Konsekuensi**: setiap query/endpoint back-office wajib menerima `AccessScope` dan memfilter brand/outlet; endpoint baru wajib punya test akses (user brand A tidak bisa membaca/mengubah brand B → 403/404). Device tidak terpengaruh: scope device = outlet-nya.

## Kepemilikan Data

| Level | Data | Catatan |
|---|---|---|
| **Perusahaan** | profil perusahaan, user, role, metode bayar, endpoint webhook, langganan/tagihan | Metode bayar diaktifkan per outlet (lihat [11](./11-trial-features.md#3-metode-bayar-per-outlet)) |
| **Brand** | profil brand (nama, logo, header/footer struk default), kategori, produk, grup \& opsi modifier, promo | SKU unik per brand |
| **Outlet** | setting outlet (tarif bps, timezone, cut-off, header struk override), meja, device, harga \& ketersediaan per outlet | |
| **Transaksi** | order, shift, payment, void, refund, cash movement | `outlet_id` dari device; `brand_id` diisi server dari outlet (denormalisasi untuk laporan) |

Aturan referensi: semua relasi master data harus satu brand — produk ↔ kategori, produk ↔ grup modifier, promo ↔ produk/kategori/outlet. Pelanggaran → 422 `CROSS_BRAND_REFERENCE`.

Header struk: `outlet.receipt_header` bila diisi, selain itu `brand.receipt_header`. Sama untuk footer.

## Hak Akses User

### Penugasan (assignment)

`user_assignments` menggantikan `outlet_user`. Satu user boleh punya beberapa baris.

| scope_type | brand_id | outlet_id | Jangkauan |
|---|---|---|---|
| `company` | null | null | Semua brand \& outlet perusahaan |
| `brand` | wajib | null | Semua outlet di brand itu (termasuk outlet baru) |
| `outlet` | wajib (brand outlet) | wajib | Satu outlet |

Role tetap `owner` / `manager` / `cashier`:
- `owner` → hanya scope `company` (CHECK constraint). Minimal satu owner aktif per perusahaan.
- `manager` → `company`, `brand`, atau `outlet`.
- `cashier` → `brand` atau `outlet` (tidak punya login back-office, hanya PIN).

Permission efektif di outlet X = gabungan permission dari semua role yang assignment-nya mencakup X. Halaman tingkat perusahaan (Users, Metode Bayar, Integrasi, Langganan, Brand) hanya untuk scope `company`.

### Konteks aktif di back-office

1. Respons `POST /auth/login` dan `GET /me/access` memuat pohon akses:
   ```json
   { "data": {
       "tenant": { "id": "01J…", "name": "PT Rasa Nusantara", "status": "active" },
       "company_scope": false,
       "brands": [
         { "id": "01J…B1", "code": "SUSHI", "name": "Maharasa Sushi", "role": "manager",
           "outlets": [ { "id": "01J…O1", "code": "BDG01", "name": "Bandung Dago", "role": "manager" } ] }
       ]
   } }
   ```
2. Header back-office punya **pemilih Brand** dan **pemilih Outlet** (outlet boleh "Semua outlet"). Pilihan terakhir disimpan per user di `localStorage`; default = brand/outlet pertama di pohon akses.
3. Request yang bergantung brand mengirim header `X-Brand-Id`. Server memvalidasi lewat `AccessScope`:
   - header tidak ada pada endpoint brand-level → 422 `BRAND_REQUIRED`
   - brand di luar scope → 403 `BRAND_FORBIDDEN`
   - outlet di luar scope, atau bukan milik brand di header → 403 `OUTLET_FORBIDDEN`
4. Laporan: tanpa filter = semua outlet yang bisa diakses user (konsolidasi perusahaan bila scope `company`); filter `brand_id` dan/atau `outlet_id`.

## POS Device

- Device tetap terikat ke satu outlet → brand otomatis. Tidak ada pemilihan brand di kasir.
- Aktivasi: daftar outlet yang ditampilkan = outlet dalam scope manager, dikelompokkan per brand.
- Pull `outlet_setting` membawa data brand:
  ```json
  { "entity": "outlet_setting", "op": "upsert", "id": "01J…O1", "version": 2101,
    "data": { "code": "BDG01", "name": "Bandung Dago", "timezone": "Asia/Jakarta",
              "business_day_cutoff": "04:00", "tax_rate_bps": 1000, "service_rate_bps": 500,
              "receipt_header": "Maharasa Sushi\nJl. Dago No. 1", "receipt_footer": "Terima kasih!",
              "brand": { "id": "01J…B1", "code": "SUSHI", "name": "Maharasa Sushi", "logo_key": "…/brands/01J….png" } } }
  ```
  `receipt_header/footer` sudah di-resolve server (outlet → brand). Perubahan brand wajib men-*touch* `outlets.version` semua outlet brand itu dalam transaksi yang sama.
- Pull katalog (`category`, `product`, `modifier_group`, `modifier_option`, `promotion`) difilter `brand_id = brand outlet device`.
- Pull `user` = user yang punya assignment mencakup outlet device (outlet scope, brand scope di brand ini, atau company scope — manajer perusahaan perlu PIN di kasir untuk approval void/refund). `role` = role efektif di outlet itu.
- Lock screen dan struk menampilkan nama/logo brand.

## Perubahan Schema

```
brands             id, code (unik per tenant, mis. SUSHI), name, logo_key, receipt_header, receipt_footer,
                   is_active, version, timestamps, deleted_at          -- ubah → touch outlets.version (brand ini)
outlets            + brand_id NOT NULL (FK brands); receipt_header/footer jadi nullable (override)
categories         + brand_id NOT NULL
products           + brand_id NOT NULL; UNIQUE (tenant_id, brand_id, sku)  -- sebelumnya (tenant_id, sku)
modifier_groups    + brand_id NOT NULL                                  -- modifier_options ikut grupnya
promotions         + brand_id NOT NULL; outlet_ids hanya outlet brand ini
shifts, orders     + brand_id NOT NULL (diisi server dari outlet saat event diterima, bukan dari payload)
refunds            + brand_id (lihat 11)
rpt_*              + brand_id; index (tenant_id, brand_id, business_date)
user_assignments   id, user_id, role_id, scope_type (company|brand|outlet), brand_id, outlet_id, created_at
                   CHECK: company → brand_id & outlet_id null; brand → brand_id not null, outlet_id null;
                          outlet → keduanya not null (outlet milik brand)
                   UNIQUE (tenant_id, user_id, scope_type, brand_id, outlet_id)
                   ubah → touch users.version
outlet_user        DIHAPUS (data dipindah ke user_assignments scope outlet)
webhook_endpoints  + brand_ids text[] (kosong = semua brand)
```

Semua tabel baru punya `tenant_id` + policy RLS (ADR-013).

### Migrasi data (Alembic, satu revisi)

1. Buat `brands`; untuk tiap tenant buat brand **"Utama"** (`code` dari slug tenant, header/footer disalin dari outlet pertama).
2. Isi `brand_id` di outlets, categories, products, modifier_groups, promotions, shifts, orders, rpt_*; lalu set `NOT NULL`.
3. Ganti unique SKU ke `(tenant_id, brand_id, sku)`.
4. `outlet_user` → `user_assignments` (scope `outlet`); user `owner` → satu baris scope `company`.
5. Update `outlets` (trigger menaikkan version) → device yang sudah aktif menarik `outlet_setting` baru di pull berikutnya. Device lama tanpa dukungan field `brand` tetap jalan (field opsional di Zod).

## API

| Method | Path | Keterangan |
|---|---|---|
| GET | `/me/access` | Pohon akses user (lihat di atas) |
| GET/POST/PUT/DELETE | `/brands`, `/brands/{id}` | Scope `company`. Hapus brand yang masih punya outlet aktif → 409 `BRAND_HAS_OUTLETS`; kode dipakai → 409 `BRAND_CODE_TAKEN` |
| GET/PUT | `/users/{id}/assignments` | Scope `company`; ganti seluruh daftar penugasan user |
| POST | `/outlets` | Body wajib `brand_id` |
| GET/POST/PUT/DELETE | `/categories`, `/products`, `/modifier-groups`, `/promotions` | Wajib header `X-Brand-Id` |
| GET | `/outlets`, `/orders`, `/shifts`, `/refunds` | Otomatis dibatasi scope; filter opsional `brand_id`, `outlet_id` |
| GET | `/reports/*` | Filter opsional `brand_id`, `outlet_id`; tanpa filter = semua outlet dalam scope |
| POST | `/tenants/signup` | Membuat perusahaan + owner + **brand pertama** + outlet pertama |

Billing tidak berubah: tagihan = jumlah outlet aktif di seluruh brand × harga per outlet (ADR-018).

## Back-office (`poslite-admin`)

- Header: pemilih Brand + Outlet; halaman yang tidak relevan untuk scope user disembunyikan.
- Halaman **Perusahaan → Brand**: daftar brand, logo (unggah via `/media/images`), header/footer struk default.
- Halaman **Users**: editor penugasan (tambah baris: role + scope perusahaan/brand/outlet).
- Menu, Harga, Promo, Meja, Perangkat: mengikuti brand/outlet aktif.
- Dashboard: tab Perusahaan (hanya scope company) / Brand / Outlet; breakdown per brand.
- Integrasi: endpoint webhook bisa dibatasi ke brand tertentu.

## Testing

| Jenis | Kasus |
|---|---|
| Unit | `AccessScope` dari kombinasi assignment; resolve header struk outlet → brand |
| Integration | Migrasi pada DB berisi data (brand "Utama", SKU unik baru, assignment); touch `outlets.version` saat brand diubah |
| E2E API | Matriks akses: manager brand A ↔ produk/outlet/laporan brand B (403/404); `CROSS_BRAND_REFERENCE`; manager outlet tidak bisa membuka halaman perusahaan |
| Sync | Device outlet brand B hanya menerima katalog \& promo brand B; user brand A tidak terkirim ke device brand B |
| Tenant isolation | Tabel `brands` \& `user_assignments` masuk test isolasi tenant |
| E2E admin | Owner membuat brand kedua → outlet → manager brand → login manager hanya melihat brand-nya |