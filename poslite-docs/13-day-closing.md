# 13 — Tutup Hari (Closing Harian)

Close shift menutup sesi **satu kasir di satu device**. Outlet dengan beberapa tablet butuh satu momen lagi: **hari operasional outlet dinyatakan selesai**, angkanya dibekukan sebagai rekap setoran harian (Z-report). Dokumen ini menjelaskan keputusan (ADR-026), aturan domain, schema, dan endpoint.

## ADR-026 — Tutup hari = snapshot per outlet × business date di back-office; tidak memblok device

- **Keputusan**: Manajer menutup satu `business_date` satu outlet dari back-office (`POST /day-closings`). Server menyimpan **snapshot** angka hari itu (penjualan, pembayaran per metode, kas gabungan semua shift) di tabel `day_closings`. Tutup hari hanya boleh setelah hari operasional berakhir (lewat `business_day_cutoff` hari berikutnya di timezone outlet) dan hanya sekali per outlet × tanggal. Shift yang masih terbuka dan device yang belum sync sejak akhir hari **tidak memblok**, tapi dicatat sebagai peringatan di snapshot dan wajib dikonfirmasi di UI.
- **Kenapa**:
  - Device offline-first tidak tahu kondisi device lain; hanya server yang melihat seluruh outlet.
  - Hari operasional sudah berganti otomatis lewat `business_day_cutoff` — kasir tidak perlu tombol "tutup hari", dan jualan tidak boleh terblok internet (ADR-001).
  - Manajer butuh angka final yang tidak bergeser diam-diam: rekap setoran harian yang bisa dicetak/diekspor.
- **Data datang setelah tutup hari**: **tidak ditolak** (transaksi device immutable — ADR-003; push tidak pernah menolak order karena alasan bisnis). Read model `rpt_*` tetap ter-update seperti biasa. Back-office membandingkan snapshot dengan angka terkini dan menampilkan `changed_since_close` beserta angka terkini, sehingga selisihnya terlihat.
- **Alternatif ditolak**:
  - (a) Tutup hari di device kasir yang memblok penjualan sampai hari ditutup — rusak saat offline dan saat ada banyak device.
  - (b) Mengunci `business_date` di server sehingga push terlambat ditolak — data penjualan nyata bisa hilang.
  - (c) Tanpa snapshot (hanya laporan live) — angka hari lama bisa berubah tanpa jejak.
- **Konsekuensi**: Tidak ada "buka ulang" tutup hari di versi pertama; koreksi tetap lewat void/refund (ADR-023) dan terlihat sebagai selisih. Webhook `day.closed` belum ada (bisa ditambah lewat outbox seperti ADR-020).

## Aturan Domain

1. Hari operasional `D` sebuah outlet berakhir pada `D + 1` pukul `business_day_cutoff` di timezone outlet. Sebelum itu → `DAY_NOT_ENDED`.
2. Satu outlet × `business_date` hanya bisa ditutup sekali → `DAY_ALREADY_CLOSED` (409).
3. Snapshot diambil dari read model laporan (`rpt_daily_sales`, `rpt_daily_payment_sales`) dan tabel `shifts` outlet itu pada tanggal itu — tidak memindai order di request path.
4. Kas: jumlah shift, shift terbuka, total `opening_cash`; untuk shift yang sudah ditutup: total `expected_cash`, `counted_cash`, `variance`.
5. Peringatan (tidak memblok):
   - `OPEN_SHIFTS` — masih ada shift `open` di tanggal itu (`count`).
   - `DEVICES_NOT_SYNCED` — device aktif (belum di-revoke) outlet yang `last_seen_at`-nya kosong atau sebelum akhir hari (`devices: [{id, code, name, last_seen_at}]`).
6. `changed_since_close` = penjualan/pembayaran/kas terkini ≠ snapshot.
7. Butuh ability `backoffice:write` dan outlet dalam akses user (ADR-022).

## Schema

```text
day_closings     id (ulid server), tenant_id, outlet_id, business_date, closed_by (users.id), closed_at,
                 notes (varchar 500), snapshot (jsonb: totals, payment_methods, cash, warnings)
                 UNIQUE (tenant_id, outlet_id, business_date), RLS tenant
```

## Endpoint

| Method | Path | Keterangan |
|---|---|---|
| GET | `/day-closings/day?outlet_id=&business_date=` | Status satu hari: `day_ended`, `current` (snapshot terkini + peringatan), `closing` (null bila belum ditutup), `changed_since_close` |
| POST | `/day-closings` `{outlet_id, business_date, notes}` | Tutup hari → 201 `closing`. Error: `DAY_NOT_ENDED` (422), `DAY_ALREADY_CLOSED` (409) |
| GET | `/day-closings?outlet_id=&from=&to=` | Riwayat tutup hari outlet (tanpa snapshot lengkap) |

Bentuk snapshot:

```json
{
  "totals": { "gross": 0, "discount": 0, "service": 0, "tax": 0, "net": 0, "order_count": 0,
              "void_count": 0, "refund_amount": 0, "refund_count": 0 },
  "payment_methods": [{ "payment_method_id": "…", "method_type": "cash", "amount": 0, "count": 0, "refund_amount": 0 }],
  "cash": { "shift_count": 0, "open_shift_count": 0, "opening_cash": 0, "expected_cash": 0,
            "counted_cash": 0, "variance": 0 },
  "warnings": [{ "code": "OPEN_SHIFTS", "count": 1 }]
}
```

## Back-office

Menu **Tutup Hari**: pilih outlet & tanggal (default kemarin) → ringkasan penjualan, pembayaran per metode, kas per shift gabungan, daftar peringatan → tombol **Tutup Hari** (dialog konfirmasi + catatan; peringatan harus dicentang dulu). Hari yang sudah ditutup menampilkan snapshot, siapa & kapan menutup, dan banner bila `changed_since_close`. Tombol **Cetak** memakai dialog cetak browser.
