# 14 — Rencana Perbaikan Menuju Pilot

Status per **2026-10-24**, berdasarkan review repo `poslite-workspace` commit `2e675b2`. Dokumen ini berisi semua pekerjaan yang harus selesai sebelum POSLite dipakai di restoran pilot, ditulis dari dua sudut pandang: **operasional restoran** (apa yang akan rusak atau bocor di lantai) dan **product owner** (apa yang dibutuhkan agar produk bisa dijual setelah pilot).

Pekerjaan dibagi ke dalam **Tahap A–F** (§4). Penamaan "Tahap" sengaja dibedakan dari **Fase 0–7** di [08](./08-roadmap-and-testing.md) agar tidak tertukar.

Penomoran melanjutkan yang sudah ada (ADR terakhir ADR-027, migrasi terakhir `0022`, Dexie terakhir v5). Nomor di dokumen ini dialokasikan **sesuai urutan pengerjaan** (lihat §3.1). Bila urutan berubah, nomor diambil ulang saat item dikerjakan, bukan dipaksa sesuai tabel.

---

## 1. Definisi "Siap Pilot"

POSLite siap pilot bila **semua** kondisi berikut terpenuhi:

1. Semua item **P0** selesai dan DoD-nya hijau di `make check`, `make web-e2e`, dan `make e2e-fullstack`.
2. Semua item **P1** yang ditandai *wajib pilot* selesai.
3. Staging berjalan di VPS + Vercel, dengan backup off-site yang sudah **diuji restore**.
4. Setiap kombinasi printer yang dipilih di **D4** lulus checklist [04 — Printing](./04-printing.md#checklist-pengujian-printer) di tablet Android dan/atau PC Windows yang akan dipakai pilot.
5. Uji beban device (P1-10) memenuhi target di perangkat pilot.
6. *Dry run* 1 hari penuh di lingkungan staging dengan data menu restoran pilot (lihat §7.3) tanpa temuan severity tinggi.
7. SOP dan materi training kasir sudah siap (lihat §6).

## 2. Keputusan yang Harus Diambil Lebih Dulu

Semua keputusan diambil **sebelum Tahap A selesai**, karena D1 dan D4 mengubah isi tahap berikutnya.

| # | Keputusan | Pilihan | Rekomendasi | Dampak |
|---|---|---|---|---|
| D1 | Model layanan restoran pilot | (a) counter-service: tamu pesan & bayar di kasir · (b) full-service: pelayan mencatat pesanan dari banyak device, bayar di kasir | ✅ **Diputuskan 2026-10-24: keduanya**, dipilih per outlet di back-office | Shared open bill naik menjadi **P0-4** (Tahap B2), jadwal persiapan mundur ±3 minggu |
| D2 | Restoran pilot menerima pesanan ojol? | Ya / Tidak | Asumsikan **ya** | Bila tidak, P0-2 boleh turun ke P1 (cukup channel Dine In & Take Away) |
| D3 | Harga di menu restoran pilot | Nett (sudah termasuk pajak) / belum termasuk pajak | Bangun keduanya | P0-3 tetap wajib karena menentukan positioning jualan |
| D4 | Printer yang dipakai pilot | Bluetooth 58 mm / LAN 80 mm / USB | Beli 1 BT 58 mm generik + 1 LAN 80 mm kompatibel Epson | Menentukan driver yang diuji di P1-6 dan apakah P1-5 wajib |
| D5 | Fallback bila POSLite gagal total | Nota manual / POS lama | Nota manual bernomor + form rekap | Wajib ada sebelum hari pertama |

## 3. Ringkasan Prioritas

| ID | Item | Prioritas | Tahap | Estimasi* | Alasan operasional |
|---|---|---|---|---|---|
| P0-1 | Audit batal bill & item setelah masuk dapur | **P0** | A | 3–4 hari | Celah fraud: makanan sudah keluar, bill dihapus tanpa jejak |
| P0-3 | Harga sudah termasuk pajak (nett) | **P0** | B | 2–3 hari | Banyak resto memajang harga nett; ditanyakan di demo pertama |
| P0-2 | Channel penjualan (dine-in, take away, GoFood, GrabFood, ShopeeFood) | **P0** | B | 5–6 hari | Tanpa ini laporan ojol tercampur tunai, owner tidak bisa rekonsiliasi |
| P0-4 | Mode layanan per outlet + shared open bill (ADR-031) | **P0** | B2 | 3 minggu | Restoran full-service: pelayan mencatat pesanan dari banyak device, kasir menagih |
| P1-1 | Nama pelanggan / nomor antrian take away | P1 · wajib pilot | C | 1–2 hari | Dapur & kasir tidak bisa memanggil pesanan |
| P1-2 | Tandai menu habis dari POS | P1 · wajib pilot | C | 2 hari | Di jam sibuk manajer tidak sempat buka back-office |
| P1-3 | Pembulatan tunai | P1 · wajib pilot | C | 2 hari | Kasir kekurangan uang receh, selisih kas |
| P1-10 | Uji beban device | P1 · wajib pilot | C | 1–2 hari | Jam sibuk ≥ 30 transaksi/jam belum pernah diuji |
| P1-7 | Kesiapan production staging (monitoring, backup, error tracking) | P1 · wajib pilot | A (provisioning) + D | 2–3 hari | Masalah harus ketahuan sebelum restoran menelepon |
| P1-8 | 2FA konsol operator | P1 · wajib sebelum data tenant asli | D | 1–2 hari | Konsol bisa reset password semua tenant |
| P1-5 | Print Bridge yang bisa dipasang orang non-teknis | P1 · wajib bila D4 memakai printer LAN | D | 3 hari | Setup sekarang butuh Node, token, dan sertifikat |
| P1-6 | Uji printer & perangkat asli (Fase 7) | P1 · wajib pilot | D | 3–4 hari | Kode sudah ada, belum pernah menyentuh printer asli |
| P1-4 | Import menu dari Excel/CSV | P1 · **tidak memblok Go** | E | 2–3 hari | Onboarding ratusan menu manual memakan waktu berjam-jam |
| P1-9 | Perbaikan dokumen | P1 | A + tiap tahap | 0,5 hari + rutin | Status di 09 tidak konsisten; ADR baru harus tercatat |
| P2-2 | Laporan kebocoran di dashboard | P2 · selama pilot | F | 2 hari | Bahan jualan setelah pilot |

\* Estimasi untuk 1 developer dengan coding agent dan alur TDD. Total P0 + P1 ±42–51 hari kerja (P0-4 sendiri ±15 hari); ditambah SOP, training, onboarding, dan dry run, persiapan pilot realistis **11 minggu** (§4).

### 3.1 Alokasi Nomor

| Item | ADR | Migrasi | Dexie |
|---|---|---|---|
| P0-1 | ADR-028 | `0023_bill_item_voids` (tabel + kolom void di `rpt_daily_sales`) | **v6**: index `openBills.updatedAt` |
| P0-3 | ADR-030 | `0024_brand_price_includes_tax` | — (flag ikut data brand di `settings`) |
| P0-2 | ADR-029 | `0025_sales_channels` (`sales_channels`, `channel_prices`, seed Dine In & Take Away) · `0026_order_channel` (`orders.channel_id`, `orders.external_ref`, backfill, `rpt_daily_channel_sales`) | **v7**: `salesChannels: "id, sortOrder"`, `channelPrices: "[channelId+productId], channelId"` |
| P0-4 | ADR-031 | `0027_service_mode_open_bills` (`outlets.service_mode`, `open_bills`, `open_bill_lines`, lease, RLS) | **v8**: `openBills` + `serverVersion`, `leaseUntil`, `origin` (`local` \| `server`), index `origin` |
| P1-1 | — | `0028_order_customer_queue` (`orders.customer_name`, `orders.queue_no`) | **v9**: `queueCounters: "businessDate"` |
| P1-2 | — | `0029_product_available_until` (`outlet_products.available_until`; `is_available` sudah ada sejak `0007`) | **v9**: `availabilityOverrides: "productId"` |
| P1-3 | — | `0030_cash_rounding` (`outlets.cash_rounding_unit`, `outlets.cash_rounding_mode`, `payments.rounding_amount`, `refunds.rounding_amount`) | — (pengaturan outlet di `settings`) |
| P1-8 | — | `0031_operator_totp` (secret TOTP terenkripsi, `operator_recovery_codes`) | — |

ADR-029 dan ADR-030 dinomori sesuai urutan dokumen (channel lebih dulu dibahas), walaupun P0-3 dikerjakan lebih dulu. v9 menggabungkan perubahan P1-1 dan P1-2 karena dikerjakan di tahap yang sama.

---

## 4. Tahapan Pekerjaan

Setiap tahap punya **gerbang keluar**. Tahap berikutnya baru dimulai bila gerbang sebelumnya terpenuhi; pekerjaan non-kode (pemesanan hardware, provisioning, SOP) boleh berjalan paralel.

```text
Minggu  1    2    3    4    5    6    7    8    9   10   11   12   13
        [A ][  B     ][  B2          ][  C ][   D    ][  E     ][  F    ]
         │                                                  │       │
         └ D1–D5 diputuskan                         Go/No-Go└ Pilot
```

### Tahap A — Fondasi & Integritas Transaksi (minggu 1)

**Tujuan**: menutup celah fraud terbesar dan menyiapkan semua hal yang butuh waktu tunggu (hardware, server).

| Kode | Non-kode (paralel) |
|---|---|
| P0-1 Audit batal bill & item (ADR-028, migrasi `0023`, Dexie v6) | Putuskan D2–D5 dan catat di §2 (D1 sudah) |
| P1-9 bagian 1 (perbaikan 09) | Pesan printer & perangkat sesuai D4 |
| | Provisioning VPS + Vercel staging (bagian awal P1-7) |
| | Hubungi calon restoran pilot, minta data menu |

**Gerbang keluar**: D1–D5 tercatat; P0-1 DoD hijau; staging bisa di-deploy dari `main`; hardware sudah dipesan.

### Tahap B — Harga & Channel (minggu 2–3)

**Tujuan**: angka di struk dan laporan benar untuk semua kombinasi yang akan dipakai restoran pilot.

Urutan wajib: **P0-3 dulu, baru P0-2**, karena aturan pajak per channel (ADR-029) bergantung pada mode harga inklusif (ADR-030).

| Kode | Non-kode (paralel) |
|---|---|
| P0-3 Harga inklusif (ADR-030, migrasi `0024`) | Kumpulkan struktur komisi & harga ojol restoran pilot |
| P0-2 Channel penjualan (ADR-029, migrasi `0025`–`0026`, Dexie v7) | Draf SOP Kasir |
| Fixture matriks channel × inklusif × diskon (§5, P0-2) | |

**Gerbang keluar**: fixture `pricing-cases.json` (termasuk matriks) hijau di web & API; e2e jual GoFood offline → sync → laporan channel benar.

### Tahap B2 — Mode Layanan & Shared Open Bill (minggu 4–6)

**Tujuan**: outlet bisa memilih counter-service atau full-service di back-office, dan di mode full-service pelayan serta kasir bekerja di bill yang sama dari device berbeda.

Dikerjakan setelah Tahap B karena bill server menyimpan harga dan channel yang sudah final.

| Kode | Non-kode (paralel) |
|---|---|
| P0-4 Mode layanan per outlet + shared open bill (ADR-031, migrasi `0027`, Dexie v8) | Draf SOP Pelayan |
| Uji konkurensi: dua device mengedit bill yang sama, lease kedaluwarsa, device offline memegang lease | Survei alur pesanan di restoran pilot (siapa input, siapa menagih) |

**Gerbang keluar**: P0-4 DoD hijau, termasuk e2e dua device; outlet counter-service tetap berperilaku sama seperti sebelum P0-4.

### Tahap C — Operasional Kasir (minggu 7)

**Tujuan**: alur kasir di jam sibuk lancar dan kas cocok.

| Kode | Non-kode (paralel) |
|---|---|
| P1-1 Nama pelanggan & nomor antrian (migrasi `0028`, Dexie v9) | Draf SOP Gangguan & SOP Manajer |
| P1-2 Tandai habis dari POS (migrasi `0029`, Dexie v9) | Checklist onboarding tenant |
| P1-3 Pembulatan tunai (migrasi `0030`) | |
| P1-10 Uji beban device | |

**Gerbang keluar**: semua DoD hijau; target P1-10 tercapai di tablet referensi (atau perangkat sejenis bila perangkat pilot belum tiba).

### Tahap D — Infrastruktur, Keamanan & Hardware (minggu 8–9)

**Tujuan**: sistem bisa dipantau, dipulihkan, aman untuk data tenant asli, dan mencetak di printer sungguhan.

| Kode | Non-kode (paralel) |
|---|---|
| P1-7 Monitoring, error tracking, backup off-site + **uji restore**, prosedur rollback | Perjanjian pilot, syarat penggunaan & kebijakan privasi |
| P1-8 2FA konsol operator (migrasi `0031`) | Materi training |
| P1-5 Print Bridge installer + pairing (bila D4 memakai LAN) | |
| P1-6 Uji perangkat asli + Daftar Perangkat Teruji | |

**Gerbang keluar**: restore dari backup sudah dilakukan dan waktunya tercatat; alert uptime & sync terbukti terkirim; 2FA aktif untuk semua `platform_admin`; checklist printer lulus untuk kombinasi D4.

### Tahap E — Onboarding, Dry Run & Go/No-Go (minggu 10–11)

**Tujuan**: membuktikan seluruh sistem bekerja dengan menu asli restoran pilot, dijalankan oleh orang, bukan test.

| Kode | Non-kode |
|---|---|
| P1-4 Import menu Excel/CSV | Import menu restoran pilot (lewat P1-4, atau input manual/skrip internal bila P1-4 belum siap) |
| Perbaikan temuan dry run | Dry run 1 hari (§7.3) |
| P1-9 bagian 2 (ADR, schema, event, Dexie di 01/03/06/07) | Training kasir & manajer |
| | **Go/No-Go** di akhir minggu 11 (§7.5) |

P1-4 dikerjakan di sini agar tidak memblok jalur kritis. Bila belum selesai, Go tetap bisa diputuskan dan menu diisi oleh tim; P1-4 wajib sebelum tenant kedua.

**Gerbang keluar**: keputusan Go/No-Go tercatat.

### Tahap F — Pilot (minggu 12–13)

Minggu 1 pendampingan intensif, minggu 2 lepas tangan. **Freeze fitur**: hanya perbaikan bug dan P2-2. Detail di §7.6.

---

## 5. Detail Perbaikan

### P0-1 — Audit Batal Bill & Batal Item Sebelum Bayar (ADR-028)

**Masalah.** `cancelBill()` di `poslite-web/src/features/bills/application/bills.ts` menghapus open bill dari IndexedDB tanpa PIN, alasan, maupun event. Kasir juga bisa mengurangi qty baris yang sudah terkirim ke dapur (`sentQuantity > 0`). Di laporan, kejadian ini tidak terlihat sama sekali.

**ADR-028 — Batal setelah dapur = event immutable yang disetujui manajer.**

- **Keputusan**:
  - Baris yang **belum** terkirim ke dapur boleh dihapus bebas (belum ada biaya bahan).
  - Mengurangi qty atau menghapus baris yang **sudah** terkirim, serta membatalkan bill yang memiliki baris terkirim, wajib PIN manajer dan alasan dari daftar baku.
  - Setiap kejadian ditulis sebagai event `bill.item_voided` ke outbox, berjalan lewat jalur push yang sama dengan `order.voided`. Server menyimpan dan melaporkannya.
  - Dapur menerima tiket **BATAL**.
- **Alternatif ditolak**: menyimpan open bill di server hanya demi audit. Itu bertentangan dengan ADR-015 dan tetap tidak menolong saat offline.

**Aturan domain**

1. `voidableWithoutApproval(line) = (line.sentQuantity ?? 0) === 0`.
2. Mengurangi qty baris dari `q` ke `q'`:
   - Bila `q' ≥ sentQuantity` → bebas, `sentQuantity` tidak berubah.
   - Bila `q' < sentQuantity` → void untuk `sentQuantity - q'` unit, butuh approval. Setelah disetujui, **`sentQuantity` diturunkan menjadi `q'`**. Tanpa ini, `kitchenPending()` di `cart/domain/kitchen.ts` dan `splitLines()` di `checkout/domain/split.ts` akan menghitung porsi terkirim yang sudah tidak ada.
   - Menghapus baris = `q' = 0`.
3. `cancelBill(bill)`:
   - Bila tidak ada baris terkirim → hapus tanpa event (perilaku sekarang).
   - Bila ada baris terkirim → satu event `bill.item_voided` per baris terkirim (`scope: "bill_cancelled"`), lalu bill dihapus.
4. Alasan baku (dapat diatur per brand nanti): `CUSTOMER_CANCELLED`, `WRONG_INPUT`, `ITEM_UNAVAILABLE`, `QUALITY_ISSUE`, `OTHER` (wajib catatan).
5. Nilai void = harga baris × qty yang dibatalkan, sebelum diskon order. Nilai ini hanya untuk laporan, tidak mempengaruhi kas.
6. Approval memakai komponen PIN manajer yang sama dengan void/refund (ADR-023). `approved_by` wajib.
7. Push **tidak pernah menolak** event ini karena alasan bisnis (konsisten dengan ADR-003).
8. Tiket BATAL masuk antrian `printJobs` seperti tiket dapur biasa. Bila printer mati atau device offline, tiket tetap tercetak saat printer kembali.

**Payload event** (`sync/push`, tipe `bill.item_voided`)

```json
{
  "id": "01J…",
  "type": "bill.item_voided",
  "occurred_at": "2026-11-02T12:31:05+07:00",
  "payload": {
    "bill_id": "01J…",
    "scope": "line",
    "table_label": "A3",
    "shift_id": "01J…",
    "business_date": "2026-11-02",
    "cashier_id": "01J…",
    "approved_by": "01J…",
    "reason": "CUSTOMER_CANCELLED",
    "note": null,
    "lines": [
      { "product_id": "01J…", "name": "Salmon Roll", "modifiers": ["Extra mayo"], "unit_price": 45000, "quantity": 1, "amount": 45000 }
    ]
  }
}
```

**Perubahan**

| Lapisan | Perubahan |
|---|---|
| Web — domain | `features/bills/domain/bill-void.ts`: `needsApproval(before, after)`, `buildVoidedLines()`, `applyVoid(line, q')` yang menurunkan `sentQuantity`; `cart/domain/kitchen.ts` mengekspor `sentPortion()` |
| Web — application | `cancelBill()` dan `saveBill()` mengembalikan `pendingVoids`; use case baru `voidBillItems({ billId, lines, reason, approverPin })` menulis event outbox + bill + print job dalam satu transaksi Dexie |
| Web — UI | Dialog alasan + PIN manajer saat mengurangi baris terkirim atau batal bill; label "sudah ke dapur" di baris cart |
| Web — printing | `kitchen-ticket` mode `cancel`: header besar **BATAL**, meja, item, qty, alasan, nama penyetuju |
| Web — Dexie v6 | Tidak ada tabel baru; event masuk `outbox`. Tambah index `openBills.updatedAt` (saat ini belum ada) |
| API — migrasi `0023` | Tabel `bill_item_voids`: `id, tenant_id, outlet_id, device_id, shift_id, business_date, bill_id, table_label, product_id, name, quantity, unit_price, amount, reason, note, cashier_id, approved_by, occurred_at`, RLS tenant, index `(tenant_id, outlet_id, business_date)`; kolom `pre_payment_void_count`, `pre_payment_void_amount` di `rpt_daily_sales` |
| API — reporting | Endpoint `reports/voids?from&to&outlet_id` per kasir/penyetuju/alasan |
| API — day closing | Snapshot `totals` menambah `pre_payment_void_count` dan `pre_payment_void_amount` ([13](./13-day-closing.md)) |
| Admin | Halaman **Laporan → Void & Batal**: tabel per kasir, penyetuju, alasan, item; export CSV |
| Integrasi | Webhook baru `bill.item_voided` (ADR-020) agar ERP/inventory bisa mencatat waste |
| Fixture | `bill-void-cases.json` dipakai oleh test web & API |

**Test (TDD, tulis dulu)**

- Unit web: `needsApproval` untuk semua kombinasi qty/sent; `applyVoid` menurunkan `sentQuantity`; setelah void, `kitchenPending()` tidak mengirim ulang porsi yang dibatalkan; split bill setelah void membagi `sentQuantity` dengan benar; `cancelBill` tanpa baris terkirim tidak membuat event, dengan baris terkirim membuat N event.
- Komponen: mengurangi baris terkirim membuka dialog PIN; PIN salah → bill tidak berubah.
- Integrasi API: push `bill.item_voided` idempoten (event sama dua kali → satu baris); isolasi tenant.
- E2E `tests/e2e/bill-void.spec.ts`: buka bill → kirim dapur → batal bill → PIN manajer → tiket BATAL tercetak (fake driver) → sync → muncul di laporan admin.

**DoD**: tidak ada jalur di UI untuk menghilangkan item terkirim tanpa approval; laporan void sebelum bayar tampil di admin dan snapshot tutup hari.

---

### P0-2 — Channel Penjualan (ADR-029)

**Masalah.** `order_type` hanya `take_away | dine_in` (`sales/domain/entities.py`, `sync/application/events.py`). Pesanan GoFood/GrabFood/ShopeeFood biasanya memakai harga yang lebih tinggi untuk menutup komisi, dibayar oleh aggregator (bukan tunai ke kasir), dan harus direkonsiliasi terpisah.

**ADR-029 — Channel = master data per brand; harga per channel opsional.**

- **Keputusan**:
  - Tabel `sales_channels` per brand: `code`, `name`, `kind` (`dine_in` | `take_away` | `delivery`), `price_mode`, `markup_bps`, `markup_rounding_unit`, `default_payment_method_id`, `applies_service`, `applies_tax`, `requires_external_ref`, `is_active`, `sort_order`.
  - `price_mode`: `base` (harga normal), `markup_bps` (persentase di atas harga normal, dibulatkan **ke atas** ke `markup_rounding_unit`, default `100`), `price_list` (harga eksplisit per produk di `channel_prices`; produk tanpa harga → tidak tersedia di channel itu).
  - Order menyimpan `channel_id` dan `external_ref` (nomor order ojol). `order_type` tetap ada, diturunkan dari `channel.kind` agar data lama kompatibel.
  - Setiap tenant mendapat seed channel **Dine In** dan **Take Away** saat signup dan migrasi.
- **Alasan**: owner Indonesia biasanya punya 3–5 channel tetap. Konfigurasi markup cukup untuk mayoritas; price list untuk yang butuh presisi.

**Interaksi dengan harga inklusif (ADR-030)**

1. Harga channel (hasil markup atau price list) **ditafsirkan dengan mode yang sama dengan brand**. Di brand inklusif, harga channel sudah termasuk pajak dan service; di brand eksklusif, belum.
2. Markup dihitung dari harga produk **seperti yang tersimpan** (harga outlet bila ada, lalu harga produk), sebelum promo dan diskon. Promo dan diskon berlaku pada harga hasil markup.
3. Tarif yang tidak berlaku di channel (`applies_service = false` atau `applies_tax = false`) dianggap `0 bps` di rumus mana pun:
   - Eksklusif: komponen itu tidak ditambahkan.
   - Inklusif: total yang dibayar tamu **tetap** harga setelah diskon. Komponen itu tidak diekstrak sehingga bagiannya masuk ke `net`.
4. Event `order.placed` menyimpan snapshot `channel_id`, `price_includes_tax`, dan tarif efektif (`service_bps`, `tax_bps` setelah aturan 3), sehingga laporan historis tidak berubah bila channel diubah.

**Perubahan**

| Lapisan | Perubahan |
|---|---|
| API — migrasi `0025` | `sales_channels`, `channel_prices (tenant_id, channel_id, product_id, price)`, RLS, seed Dine In & Take Away untuk tenant yang sudah ada |
| API — migrasi `0026` | `orders.channel_id` (nullable untuk data lama, backfill dari `order_type`), `orders.external_ref`, read model `rpt_daily_channel_sales (tenant_id, outlet_id, business_date, channel_id, order_count, gross, net, total)` |
| API — catalog | CRUD channel + bulk upsert `channel_prices`; delta pull menyertakan channel & harga |
| API — sales | `place_order` memvalidasi harga baris terhadap channel (flag, bukan tolak — sama dengan kebijakan ADR-003); `PriceCalculator` memakai tarif efektif channel |
| Web — Dexie v7 | Tabel `salesChannels` dan `channelPrices` (`[channelId+productId]`) diisi dari delta pull |
| Web | Pemilih channel di header cart (default dari pengaturan device); grid produk menampilkan harga channel; field `external_ref` wajib bila `requires_external_ref`; metode bayar default dari channel |
| Web — struk & tiket dapur | Nama channel + `external_ref` dicetak besar (driver ojol menyebut nomor ini) |
| Admin | Halaman **Channel**: daftar, mode harga, matriks harga per produk (bisa import, lihat P1-4); dashboard breakdown per channel |
| Fixture | Perluas `pricing-cases.json`, lihat matriks di bawah |

**Matriks fixture minimum** (setiap sel ≥ 1 kasus, dipakai web & API):

| | `base` | `markup_bps` | `price_list` |
|---|---|---|---|
| Eksklusif, service + pajak | ✓ | ✓ | ✓ |
| Eksklusif, `applies_service = false` | ✓ | ✓ | ✓ |
| Inklusif, service + pajak | ✓ | ✓ | ✓ |
| Inklusif, `applies_tax = false` | ✓ | ✓ | ✓ |
| Inklusif, keduanya `false` | ✓ | ✓ | ✓ |

Setiap baris matriks diuji tanpa diskon, dengan diskon item, dengan diskon order, dan dengan split bill.

**Test**: fixture identik di web & API; e2e jual GoFood offline → sync → laporan channel benar; produk tanpa harga di channel `price_list` tidak bisa dipilih; order lama tanpa `channel_id` muncul di laporan sebagai Dine In / Take Away setelah backfill.

**DoD**: owner bisa melihat penjualan per channel per hari, dan total pembayaran aggregator cocok dengan laporan channel.

---

### P0-3 — Harga Sudah Termasuk Pajak (ADR-030)

**Masalah.** `PriceCalculator.calculate()` (API) dan kalkulasi web selalu menambahkan service dan PB1 **di atas** harga. Tidak ada opsi harga nett.

**ADR-030 — `price_includes_tax` per brand; kalkulasi mundur dengan integer.**

- **Keputusan**: flag `price_includes_tax: bool` di `brands` (default `false`). Bila `true`, harga produk sudah termasuk service dan PB1. Total yang dibayar = harga setelah diskon. Service dan pajak dihitung mundur untuk laporan dan struk.
- **Rumus** (semua integer, half-up, urutan sama dengan rumus eksklusif; `service_bps`/`tax_bps` adalah tarif efektif setelah aturan channel di ADR-029):

```text
inclusive  = subtotal - discount_amount                 # yang dibayar tamu
pre_tax    = div_round_half_up(inclusive * 10000, 10000 + tax_bps)
tax        = inclusive - pre_tax
net        = div_round_half_up(pre_tax * 10000, 10000 + service_bps)
service    = pre_tax - net
total      = inclusive
```

Selisih pembulatan selalu diserap oleh `tax` dan `service`, sehingga `net + service + tax == total` selalu benar.

| Lapisan | Perubahan |
|---|---|
| API — migrasi `0024` | `brands.price_includes_tax` |
| API | `Rates` menambah `inclusive`; `PriceCalculator` bercabang; `order.placed` menyimpan flag agar laporan historis benar |
| Web | `use-cart-totals.ts` dan `shared/money` memakai rumus yang sama; struk menulis "Harga sudah termasuk PB1 x% dan service y%" |
| Admin | Toggle di halaman Brand, dengan peringatan bahwa perubahan hanya berlaku untuk transaksi baru |
| Fixture | ≥ 15 kasus inklusif di `pricing-cases.json`, termasuk diskon, promo, split bill, dan refund parsial |
| Refund | `RefundAllocator` tidak berubah (berbasis total), tetapi tambahkan kasus fixture inklusif di `refund-cases.json` |

**DoD**: fixture hijau di kedua sisi; laporan pajak bulanan untuk brand inklusif cocok dengan perhitungan manual sampel 50 transaksi.

---

### P0-4 — Mode Layanan per Outlet & Shared Open Bill (ADR-031)

**Masalah.** ADR-015 menyimpan open bill hanya di device yang membukanya. Itu cukup untuk counter-service, tetapi di restoran full-service pelayan mencatat pesanan di tablet masing-masing dan kasir menagih di device lain. Tanpa bill bersama, kasir tidak bisa melihat bill pelayan, dan pindah meja atau gabung bill lintas device tidak mungkin.

**ADR-031 — Mode layanan per outlet; mode `table_service` menyimpan open bill di server dengan lease.**

- **Keputusan**:
  - Kolom `outlets.service_mode`: `counter` (default) atau `table_service`. Diatur owner/manajer di halaman **Outlet** back-office.
  - `counter`: perilaku sekarang tidak berubah (ADR-015). Open bill lokal per device, 100% offline.
  - `table_service`: open bill disimpan di server (`open_bills`, `open_bill_lines`) dengan `version` untuk optimistic locking. Device mengambil **lease** 60 detik saat mengedit bill, diperpanjang otomatis selama layar bill terbuka.
  - Pembayaran tetap event `order.placed` yang immutable (ADR-003); event itu menutup bill server. Void sebelum bayar tetap event `bill.item_voided` (ADR-028).
  - ADR-015 tetap berlaku untuk outlet `counter`. ADR-031 tidak mengubah ADR-015, tetapi menambah mode kedua.
- **Alternatif ditolak**: sinkron peer-to-peer antar device di LAN. Rumit, tidak ada di browser tanpa server, dan tidak memberi jejak audit.

**Aturan domain**

1. Device membaca `service_mode` dari delta pull outlet. Perubahan mode baru berlaku di device bila device **tidak punya open bill lokal**. Selama masih ada, POS menampilkan banner "Selesaikan bill terbuka untuk beralih mode".
2. Back-office menolak perubahan `table_service` → `counter` bila masih ada open bill di server untuk outlet itu (409 `OPEN_BILLS_EXIST`).
3. Mode `table_service`, **online**:
   - Daftar bill outlet diperbarui lewat polling 5 detik (`GET /open-bills?outlet_id=&since_version=`). SSE bisa menyusul setelah pilot.
   - Edit bill butuh lease. Device lain melihat bill itu read-only dengan label "sedang diedit oleh <nama> di <device>".
   - Simpan bill = `PUT /open-bills/{id}` dengan `version`. Versi lama → 409 `BILL_VERSION_CONFLICT`; device memuat ulang bill dan menampilkan perubahan.
   - Kirim ke dapur dilakukan oleh device yang memegang lease. `sentQuantity` disimpan di server, sehingga device lain tidak mencetak ulang.
4. Mode `table_service`, **offline**:
   - Device tetap bisa membuat bill baru dan mengedit bill yang lease-nya ia pegang. Bill baru diberi `origin: local` dan diunggah saat online.
   - Bill lain read-only sampai online.
   - Lease yang kedaluwarsa saat device offline boleh diambil device lain. Saat device pertama online, simpan ditolak `BILL_VERSION_CONFLICT`, dan perubahan offline-nya ditampilkan ke pengguna untuk diterapkan ulang. Perubahan tidak pernah digabung otomatis.
   - Bayar saat offline tetap boleh untuk bill yang lease-nya dipegang. `order.placed` masuk outbox seperti biasa dan menutup bill di server saat sync.
5. Peran baru **Pelayan**: boleh membuat dan mengedit bill serta kirim ke dapur; tidak boleh menerima pembayaran, void setelah bayar, atau refund. Void sebelum bayar tetap butuh PIN manajer (ADR-028).
6. Pindah meja dan gabung bill lintas device diizinkan di `table_service` (butuh lease kedua bill).
7. Shift kasir tidak bisa ditutup bila ada bill server yang lease-nya ia pegang. Bill tanpa lease tidak memblok tutup shift, karena bill itu milik outlet, bukan milik device.

**Perubahan**

| Lapisan | Perubahan |
|---|---|
| API — migrasi `0027` | `outlets.service_mode`; `open_bills (id, tenant_id, outlet_id, table_id, table_label, channel_id, opened_by, opened_at, version, lease_device_id, lease_user_id, lease_until, closed_at, closed_by_order_id)`; `open_bill_lines (bill_id, line_key, product_id, …, quantity, sent_quantity)`; RLS tenant |
| API — sales | Modul open bill: buat, ambil lease, perpanjang, lepas, simpan dengan versi, daftar per outlet; `order.placed` dengan `bill_id` menutup bill |
| API — organization | `service_mode` di endpoint outlet + validasi 409 `OPEN_BILLS_EXIST`; peran Pelayan di seed role |
| Web — Dexie v8 | `openBills` menambah `serverVersion`, `leaseUntil`, `origin`; index `origin` |
| Web — application | Repository open bill dengan dua implementasi (`LocalBillStore` untuk `counter`, `ServerBillStore` untuk `table_service`) di balik satu port, sehingga UI cart tidak tahu mode |
| Web — UI | Daftar bill outlet dengan status lease; banner pergantian mode; mode read-only |
| Admin | Pilihan mode layanan di halaman Outlet, dengan penjelasan dampaknya |
| Docs | ADR-031 di [01](./01-system-architecture.md); ADR-015 diberi catatan "berlaku untuk mode `counter`" |

**Test**

- Unit web: pemilihan store sesuai mode; aturan pergantian mode saat ada bill lokal.
- Integrasi API: lease eksklusif; lease kedaluwarsa bisa diambil; simpan dengan versi lama → 409; `order.placed` menutup bill; isolasi tenant.
- Konkurensi: dua request simpan bersamaan pada versi sama → tepat satu berhasil.
- E2E `tests/e2e/table-service.spec.ts` (dua browser context): pelayan buka bill & kirim dapur → kasir melihat bill → kasir bayar → bill hilang dari daftar pelayan. Varian offline: device pegang lease, putus koneksi, edit, online kembali, sync berhasil.
- Regresi: seluruh e2e dine-in yang ada tetap hijau di mode `counter`.

**DoD**: owner mengganti mode outlet di back-office; di `table_service`, bill pelayan terlihat dan dibayar di device kasir tanpa input ulang; di `counter`, perilaku sama seperti sebelum P0-4.

---

### P1-1 — Nama Pelanggan & Nomor Antrian (Take Away / Delivery)

- Field opsional `customer_name` (≤ 40 karakter) di cart untuk channel `take_away` dan `delivery`.
- `queue_no` per device per `business_date`, dengan format `<kode device>-<nomor 3 digit>`, misalnya `A-012`. Kode device (`A`, `B`, …; unik per outlet) dipakai sebagai prefix agar nomor tidak bentrok antar tablet saat offline. Reset setiap ganti business date.
- Counter disimpan di Dexie v9 (`queueCounters`) dan dinaikkan dalam transaksi yang sama dengan penyimpanan order.
- Dicetak besar di struk dan tiket dapur; tampil di riwayat order.
- API (migrasi `0028`): kolom `orders.customer_name`, `orders.queue_no`.
- **DoD**: dua device offline menghasilkan nomor antrian yang tidak bentrok; reload aplikasi di tengah hari tidak me-reset counter.

### P1-2 — Tandai Menu Habis dari POS

- Manajer atau kasir dengan izin `pos:availability` menandai produk **habis** dari grid produk (tekan lama → "Tandai habis").
- Efek lokal langsung, termasuk saat offline (Dexie v9, `availabilityOverrides`). Event `product.availability_changed { product_id, outlet_id, is_available, until }` masuk ke outbox.
- `until` default = akhir business date (menu otomatis tersedia lagi besok). Opsi "sampai diaktifkan lagi".
- Server menulis `outlet_products.is_available` (kolom sudah ada sejak migrasi `0007`) dan `available_until` (migrasi `0029`); device lain mendapatkannya lewat delta pull. Konflik: event terbaru menang (berdasarkan `occurred_at` server-adjusted).
- **DoD**: tandai habis di tablet A → tablet B ikut habis setelah pull berikutnya; besok kembali tersedia otomatis.

### P1-3 — Pembulatan Tunai

- Pengaturan outlet (migrasi `0030`) `cash_rounding_unit`: `0` (mati), `100`, `500`, atau `1000`, dengan `cash_rounding_mode`: `nearest` | `down`.
- Hanya berlaku untuk bagian pembayaran **tunai**. Total order dan pajak tidak berubah; selisihnya disimpan sebagai `payments.rounding_amount` (bisa negatif).
- **Pembayaran campuran**: non-tunai dibayar persis. Pembulatan diterapkan pada sisa yang dibayar tunai: `cash_due = total - non_cash_paid`, lalu `cash_charged = round(cash_due)`.
- **Split bill**: setiap order hasil split dibulatkan sendiri-sendiri.
- **Refund**: nilai refund dihitung `RefundAllocator` dari total seperti biasa. Bila refund dibayar tunai, nilai tunai yang dikembalikan dibulatkan dengan aturan outlet yang sama; selisihnya disimpan di `refunds.rounding_amount`.
- Laporan dan tutup hari menampilkan total pembulatan; `expected_cash` shift ikut memperhitungkannya.
- Struk: baris "Pembulatan".
- Fixture `cash-rounding-cases.json` dipakai web & API, dan wajib mencakup: tunai penuh, campuran QRIS + tunai, split bill 2 dan 3 bagian, refund parsial tunai, refund penuh, serta mode `down`.

### P1-4 — Import Menu dari Excel/CSV

- Template `.xlsx` yang bisa diunduh dari admin, berisi sheet `products`, `categories`, `modifier_groups`, `channel_prices`, dan `outlet_prices`.
- Alur: unggah → validasi dengan pratinjau error per baris → konfirmasi → upsert berdasarkan `sku` atau nama.
- Import bersifat transaksional: semua baris masuk atau tidak ada sama sekali.
- **Alasan**: ini menghemat waktu onboarding terbesar. Saat pilot, tim POSLite yang mengisi menu restoran, dan setelah pilot owner bisa melakukannya sendiri.
- **Status**: tidak memblok Go (Tahap E). Wajib selesai sebelum onboarding tenant kedua.
- **DoD**: menu 200 produk + modifier masuk dalam < 5 menit dari file contoh.

### P1-5 — Print Bridge untuk Non-Teknis

Setup sekarang membutuhkan Node 24, token manual, dan mkcert. Untuk pilot:

1. **Distribusi**: bundle menjadi satu `poslite-bridge.exe` (Node SEA) ditambah installer yang mendaftarkannya sebagai Windows service yang otomatis jalan saat boot.
2. **Default aman**: bind `127.0.0.1`, sehingga PC kasir yang menjadi host bridge (tanpa sertifikat).
3. **Pairing**: halaman lokal `http://localhost:9180/` menampilkan **kode 6 digit**. POS memasukkan kode itu, lalu bridge mengembalikan token. Pengguna tidak perlu mengetik token panjang.
4. **Mode tablet (LAN)**: dokumentasikan sebagai setup oleh teknisi saja, bukan oleh owner, sampai ada solusi sertifikat yang lebih mudah.
5. Halaman status lokal: daftar printer, test print, dan log error terakhir (tanpa isi struk).

**DoD**: orang non-developer bisa memasang bridge dan mencetak test print dalam < 10 menit dengan mengikuti panduan bergambar.

### P1-6 — Uji Printer & Perangkat Asli (Fase 7)

- Jalankan [checklist 04](./04-printing.md#checklist-pengujian-printer) untuk kombinasi yang dipilih di D4: tablet Android + BT 58 mm, PC Windows + LAN 80 mm lewat bridge, dan PC Windows + USB bila ada.
- Skenario wajib: cetak saat offline, printer mati lalu nyala kembali (antrian cetak berlanjut), kertas habis, dua tablet mencetak ke printer dapur yang sama, reprint, tiket BATAL (P0-1), struk channel ojol (P0-2), struk harga inklusif (P0-3), nomor antrian (P1-1), dan baris pembulatan (P1-3).
- Selesaikan item tersisa di 09: tiket batal item (sudah tercakup di P0-1) dan cetak ulang tiket dapur/bar.
- Buat **Daftar Perangkat Teruji** (merek/model tablet, versi Android/Chrome, printer, koneksi). Daftar ini yang dipakai di materi jualan.
- Tulis jelas di materi: **iPad/iPhone belum mendukung printer Bluetooth** (Web Bluetooth tidak tersedia di Safari). Opsinya adalah printer LAN lewat bridge.

### P1-7 — Kesiapan Production Staging

Provisioning VPS + Vercel dimulai di Tahap A; sisanya di Tahap D.

| Item | Minimum untuk pilot |
|---|---|
| Error tracking | Sentry (atau sejenisnya) di API, worker, dan web, dengan `tenant_id` dan `device_id` sebagai tag (tanpa PII) |
| Uptime | Cek `/api/v1/health` tiap 1 menit, notifikasi ke WhatsApp/Telegram |
| Kesehatan sync | Endpoint/alert internal: device yang belum push > 2 jam saat jam operasional; outbox server yang macet |
| Backup | `deploy/staging/backup.sh` ke storage off-site harian; **uji restore** ke database kosong dan catat waktunya |
| Log | Retensi minimal 14 hari |
| Rilis | Tag versi per rilis; rilis web hanya di luar jam operasional restoran pilot; SW update tetap tidak memaksa reload (sudah ada) |
| Rollback | Prosedur tertulis: rollback image API + `alembic downgrade` satu langkah + redeploy Vercel ke build sebelumnya. Setiap migrasi `0023`–`0031` wajib punya `downgrade()` yang diuji |

### P1-8 — 2FA Konsol Operator

- TOTP (RFC 6238) untuk semua akun `platform_admin`; wajib saat login pertama setelah fitur aktif.
- 10 recovery code sekali pakai (migrasi `0031`).
- Audit log mencatat aktivasi/reset 2FA.
- Rate limit login sudah ada (ADR-027); tambahkan juga untuk verifikasi TOTP.
- Wajib selesai sebelum data menu restoran pilot masuk ke staging (Tahap E).

### P1-9 — Perbaikan Dokumen

**Bagian 1 (Tahap A)**

1. [09](./09-scope-and-status.md): tabel fase menulis Fase 7 "⏳ Belum mulai", sedangkan bagian bawahnya "kode selesai, tinggal uji perangkat keras". Seragamkan menjadi "Kode selesai · uji perangkat belum".
2. [09](./09-scope-and-status.md): "20 migrasi Alembic" → 22.
3. [09](./09-scope-and-status.md) dan [08](./08-roadmap-and-testing.md): tautkan dokumen ini sebagai rencana berikutnya.

**Bagian 2 (rutin, tiap item selesai; dicek ulang di Tahap E)**

- ADR-028 sampai ADR-031 ke [01](./01-system-architecture.md), schema ke [06](./06-domain-and-database.md), event & endpoint ke [07](./07-api-contract.md), Dexie v6–v9 ke [03](./03-offline-sync.md), jumlah migrasi di 09.

### P1-10 — Uji Beban Device

Metrik pilot menuntut ≥ 30 transaksi/jam di jam puncak, dan dry run mematikan Wi-Fi selama 2 jam. Keduanya belum pernah diuji di perangkat.

- Skrip seed lokal (`make web-load-seed` atau sejenisnya): **3.000 order** historis di Dexie (±1 bulan), **5 open bill** aktif, dan **outbox 500 event pending** (setara 2 jam offline di jam sibuk ditambah event void, refund, dan ketersediaan menu).
- Ukur di tablet referensi (dan perangkat pilot bila sudah ada):

| Metrik | Target |
|---|---|
| Tambah item ke cart (tap → tampil) | < 100 ms |
| Bayar tunai sampai struk masuk antrian cetak | < 500 ms |
| Buka riwayat order hari ini | < 1 detik |
| Push 500 event setelah online kembali | < 60 detik, tanpa duplikat |
| Ukuran IndexedDB setelah seed | Tercatat (untuk batas retensi lokal) |

- Hasil dicatat di [08](./08-roadmap-and-testing.md). Bila target tidak tercapai, perbaikan masuk Tahap C sebelum gerbang keluar.

---

### P2-2 — Laporan Kebocoran di Dashboard

Satu kartu ringkas per outlet per hari: void sebelum bayar, void setelah bayar, refund, diskon di atas batas kasir, selisih kas shift, dan pembulatan. Semua datanya sudah tersedia setelah P0-1 dan P1-3. Kartu ini akan menjadi bahan utama demo jualan setelah pilot.

---

## 6. Kesiapan Operasional (Non-Kode)

Sama pentingnya dengan kode. Pilot gagal lebih sering karena orang dan proses daripada karena bug.

| Dokumen / aktivitas | Isi | Pemilik | Tahap |
|---|---|---|---|
| **SOP Kasir** (1–2 halaman, bergambar) | Buka shift, jual dine-in/take away/ojol, split bill, void dengan PIN, tutup shift | PO | B (draf) → E (final) |
| **SOP Gangguan** | Internet mati (lanjut jualan, cek badge sync), printer mati (struk lewat reprint nanti), tablet mati (export darurat, ganti device), kapan beralih ke nota manual (D5) | PO | C → E |
| **SOP Manajer** | Approval void/diskon, tutup hari, cek laporan void & selisih kas, tandai habis | PO | C → E |
| **Training** | 1 sesi 60 menit untuk kasir + 30 menit untuk manajer, praktik di mode demo | PO + manajer resto | E |
| **Checklist onboarding tenant** | Signup → brand → import menu → channel & harga → metode bayar → user & PIN → aktivasi device → test print → transaksi uji → void uji | PO | C |
| **Support** | Grup WhatsApp khusus pilot; pendampingan di lokasi pada 3 hari pertama di jam sibuk; target respons < 15 menit di jam operasional | PO | F |
| **Legal ringan** | Syarat penggunaan & kebijakan privasi (UU PDP): data milik tenant, retensi, ekspor data saat berhenti | PO | D |
| **Perjanjian pilot** | Durasi, gratis selama pilot, ekspektasi feedback mingguan, izin memakai nama/testimoni bila berhasil | PO | D |

## 7. Rencana Pilot

### 7.1 Kriteria Restoran Pilot

- Mode layanan sesuai praktik restoran (`counter` atau `table_service`, P0-4). 1–2 kasir; untuk `table_service`, 1–3 tablet pelayan.
- 1 outlet dulu. Outlet kedua atau brand kedua baru ditambahkan di minggu ke-2 pilot bila minggu pertama stabil.
- Owner atau manajer bersedia mengikuti review mingguan 30 menit.
- Ada jam sibuk nyata (≥ 30 transaksi per jam di puncak), supaya performa benar-benar teruji.

### 7.2 Jadwal (indikatif)

| Minggu | Tahap | Kegiatan |
|---|---|---|
| 1 | A | P0-1, P1-9 bagian 1, D2–D5, pesan hardware, provisioning staging |
| 2–3 | B | P0-3 lalu P0-2 (API, web, admin, fixture matriks) |
| 4–6 | B2 | P0-4 mode layanan & shared open bill, uji konkurensi |
| 7 | C | P1-1, P1-2, P1-3, P1-10 |
| 8–9 | D | P1-7, P1-8, P1-5, P1-6, legal & perjanjian pilot |
| 10–11 | E | P1-4, import menu restoran pilot, dry run (§7.3), perbaikan, training, **Go/No-Go** |
| 12–13 | F | **Pilot** 2 minggu: minggu 1 pendampingan intensif, minggu 2 lepas tangan |

### 7.3 Dry Run (sebelum Go/No-Go)

Satu hari penuh dengan menu asli restoran pilot, perangkat yang sama, dan 2–3 orang berperan sebagai kasir, manajer, dan pelayan:

- ≥ 150 transaksi campuran dine-in, take away, dan ojol, termasuk split bill, diskon di atas batas, void sebelum dan sesudah bayar, refund parsial, dan pembayaran campuran dengan pembulatan.
- Satu jam dengan ritme ≥ 30 transaksi.
- Bila outlet `table_service`: pelayan dan kasir mengedit bill yang sama, satu tablet pelayan offline 15 menit memegang lease, lalu pindah meja lintas device.
- Ganti mode outlet di back-office di luar jam operasional, lalu pastikan device beralih setelah bill lokal selesai.
- Matikan Wi-Fi selama 2 jam di tengah hari, nyalakan kembali, lalu pastikan semua tersinkron.
- Reboot satu tablet di tengah transaksi.
- Matikan printer saat ada antrian cetak.
- Tutup shift, tutup hari, lalu cocokkan laporan back-office dengan hitungan manual.

### 7.4 Metrik Keberhasilan Pilot

| Metrik | Target |
|---|---|
| Transaksi hilang / gagal sync permanen | **0** |
| Selisih laporan back-office vs rekap manual harian | **Rp0** (selain selisih kas yang memang dicatat kasir) |
| Waktu rata-rata input + bayar 1 order take away (3 item) | ≤ 45 detik setelah hari ke-3 |
| Kegagalan cetak yang butuh bantuan support | ≤ 1 per hari di minggu ke-2 |
| Insiden yang membuat restoran beralih ke nota manual | ≤ 1 selama pilot, dan pulih < 30 menit |
| Waktu onboarding menu (import + verifikasi) | ≤ 2 jam (dengan P1-4) |
| Kepuasan kasir & manajer (skala 1–5, akhir pilot) | ≥ 4 |
| Owner bersedia lanjut berbayar / memberi testimoni | Ya |

### 7.5 Kriteria Go/No-Go (akhir minggu 11)

**Go** bila: semua P0 dan P1 *wajib pilot* selesai, gerbang keluar Tahap A–D terpenuhi, dry run tanpa temuan severity tinggi, backup sudah diuji restore, monitoring aktif, SOP dan training selesai, serta fallback D5 siap.

**No-Go** bila ada salah satu: transaksi hilang di dry run, laporan tidak cocok dengan rekap manual, printer pilot gagal di skenario dasar, atau target P1-10 tidak tercapai di perangkat pilot.

### 7.6 Selama Pilot

- Rekonsiliasi harian (10 menit): laporan back-office vs uang di laci & settlement ojol; catat selisih dan penyebabnya.
- Log masalah bersama (spreadsheet atau issue GitHub) dengan severity, waktu, device, dan langkah reproduksi.
- **Freeze fitur**: selama pilot hanya perbaikan bug dan item P2-2. Fitur baru dicatat untuk setelah pilot.
- Review mingguan dengan owner: metrik §7.4, top 3 keluhan, dan keputusan.

## 8. Sengaja Tidak Dikerjakan Sebelum Pilot

| Item | Alasan |
|---|---|
| Adapter payment gateway sungguhan (Midtrans/Xendit) | QRIS statis + metode manual cukup untuk pilot; vendor dipilih setelah tahu volume |
| Inventory/stok | Tetap di luar lingkup; kirim webhook `order.placed` dan `bill.item_voided` ke sistem lain |
| Loyalty/member, reservasi, KDS layar dapur | Ditunda sampai ada sinyal kuat dari pilot |
| Wrapper Capacitor (iOS + Bluetooth) | Hanya bila calon pelanggan banyak memakai iPad |
| Peran operator, impersonate tenant | Tim operator masih kecil |

## 9. Checklist Ringkas

**Tahap A — Fondasi & Integritas Transaksi**
- [x] D1 diputuskan: kedua mode, per outlet (2026-10-24)
- [ ] D2–D5 diputuskan dan dicatat di §2
- [ ] P0-1 Audit batal bill & item (ADR-028, `0023`, Dexie v6)
- [x] P1-9 bagian 1 (perbaikan 08/09)
- [ ] Hardware dipesan sesuai D4
- [ ] Staging VPS + Vercel ter-provision

**Tahap B — Harga & Channel**
- [ ] P0-3 Harga inklusif pajak (ADR-030, `0024`)
- [ ] P0-2 Channel penjualan (ADR-029, `0025`–`0026`, Dexie v7)
- [ ] Fixture matriks channel × inklusif × diskon hijau di web & API

**Tahap B2 — Mode Layanan & Shared Open Bill**
- [ ] P0-4 Mode layanan per outlet + shared open bill (ADR-031, `0027`, Dexie v8)
- [ ] Uji konkurensi & e2e dua device hijau
- [ ] Regresi mode `counter` hijau

**Tahap C — Operasional Kasir**
- [ ] P1-1 Nama pelanggan & nomor antrian (`0028`, Dexie v9)
- [ ] P1-2 Tandai habis dari POS (`0029`, Dexie v9)
- [ ] P1-3 Pembulatan tunai (`0030`)
- [ ] P1-10 Uji beban device memenuhi target
- [ ] Checklist onboarding tenant

**Tahap D — Infrastruktur, Keamanan & Hardware**
- [ ] P1-7 Monitoring, backup off-site, uji restore, prosedur rollback
- [ ] P1-8 2FA konsol operator (`0031`)
- [ ] P1-5 Print Bridge installer + pairing (bila D4 memakai LAN)
- [ ] P1-6 Uji perangkat asli + Daftar Perangkat Teruji
- [ ] Perjanjian pilot + syarat & privasi

**Tahap E — Onboarding, Dry Run & Go/No-Go**
- [ ] P1-4 Import menu Excel/CSV (tidak memblok Go)
- [ ] Menu restoran pilot masuk staging
- [ ] P1-9 bagian 2 (01/03/06/07 mutakhir)
- [ ] SOP kasir, gangguan, manajer + training
- [ ] Dry run lulus (§7.3)
- [ ] Go/No-Go disetujui

**Tahap F — Pilot**
- [ ] Pilot minggu 1 (pendampingan intensif)
- [ ] Pilot minggu 2 (lepas tangan) + P2-2
- [ ] Review akhir pilot & keputusan lanjut berbayar
