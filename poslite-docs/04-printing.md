# 04 — Printing

## Realita Browser (penting sebelum beli printer)

Printer thermal POS terhubung lewat beberapa cara, dan **tidak semua bisa diakses dari browser**:

| Koneksi printer | API browser | Chrome Android | Chrome/Edge Windows | iOS Safari |
|---|---|---|---|---|
| Bluetooth **Classic (SPP)** — mayoritas printer 58mm murah | **Web Serial** (RFCOMM) | ✅ Chrome 137+ | ✅ Chrome 117+ (printer harus di-pair di OS dulu) | ❌ |
| Bluetooth **Low Energy (BLE)** | **Web Bluetooth** | ✅ | ✅ | ❌ |
| USB | **WebUSB** / Web Serial (jika virtual COM) | ✅ WebUSB | ⚠️ WebUSB butuh driver WinUSB (Zadig) — sering bentrok dengan driver printer; lebih aman lewat System print | ❌ |
| LAN / WiFi (port 9100 raw) | ❌ tidak ada raw TCP di browser | via Print Bridge | via Print Bridge | via Print Bridge |
| LAN — Epson ePOS / Star WebPRNT (HTTP) | `fetch` ke printer | ✅ (perlu HTTPS/CORS setup) | ✅ | ✅ |
| Printer terinstall di OS | `window.print()` | ✅ (dialog) | ✅ (silent dengan `--kiosk-printing`) | ✅ AirPrint |

Kesimpulan:
- **Android + Chrome** adalah platform terbaik untuk PWA POS (Bluetooth Classic, BLE, USB semua bisa).
- **Windows**: Bluetooth Classic via Web Serial, USB paling aman via system driver + `window.print()` kiosk mode.
- **iOS**: hanya system print/AirPrint atau printer LAN berbasis HTTP. Jika iOS wajib didukung dengan printer Bluetooth → perlu wrapper native (Capacitor) di fase berikutnya.
- Semua API di atas **wajib HTTPS** dan dipicu **user gesture** saat pairing pertama.

## Prioritas Driver (keputusan 2026-09-25)

Tenant SaaS akan memakai semua jenis printer, jadi driver dibangun bertahap:

| Fase | Driver | Target printer |
|---|---|---|
| 1 | `web-serial` + `system` (fallback) | Bluetooth Classic 58mm (mayoritas printer murah); printer apa pun yang terinstall di OS |
| 1b | `web-bluetooth`, `web-usb` | Printer BLE; USB di Android (di Windows tetap via `system`) |
| 4 | `bridge` (+ HTTP ePOS/WebPRNT) | Printer LAN/WiFi port 9100; Epson ePOS / Star WebPRNT langsung via HTTP |

Halaman Settings → Printer hanya menampilkan tipe koneksi yang `isSupported()` di browser tersebut.

## Arsitektur Printing

Implementasi saat ini (Fase 7) — lebih datar dari rancangan di bawah:

```
features/printing/
├── domain/        receipt-builder, correction-slips, kitchen-ticket, test-page, text-layout (dokumen → baris 32/48 kolom)
├── application/   print-receipt / print-slips / print-kitchen (printJobs, tidak pernah throw), configured-printer
│                  (printer per peran dari tabel `printers`; default system), printer-setup
└── infrastructure/
    ├── escpos-renderer.ts      # dokumen → ESC/POS; baris dari text-layout (sama dengan pratinjau), encoder hanya bold/codepage/cut
    ├── escpos-printer.ts       # render → connect → send; gagal kirim = disconnect, connect, kirim ulang sekali
    ├── web-serial-driver.ts    # Bluetooth Classic (SPP) & USB-serial: requestPort / getPorts() + getInfo(), chunk 512 byte
    ├── web-bluetooth-driver.ts # BLE: requestDevice (service printer umum) / getDevices(), characteristic yang bisa ditulis, chunk 20 byte
    ├── web-usb-driver.ts       # USB (Android): requestDevice / getDevices(), interface class 7 (atau bulk OUT apa pun), chunk 512 byte
    ├── epson-epos-driver.ts    # LAN Epson: POST https://<ip>/cgi-bin/epos/service.cgi, ESC/POS sebagai hex `<command>`
    ├── bridge-driver.ts        # LAN 9100 lewat poslite-print-bridge: POST <bridge>/print + Bearer token
    └── system-printer.ts       # window.print()
```

Driver `picker` (Web Serial/Bluetooth/USB) di-pair lewat dialog browser; driver `address` (Epson ePOS, Print Bridge) diisi alamatnya di layar Printer. Yang disimpan di `printers.device`: `getInfo()` Web Serial, id device BLE, vendor/product/serial USB, atau alamat printer (+ URL & token bridge).

Catatan per driver:
- **Web Serial**: dua printer Bluetooth tidak bisa dibedakan dari `getInfo()` — bila beberapa diizinkan, yang pertama dipakai.
- **Web Bluetooth**: `getDevices()` di beberapa versi Chrome masih di balik flag; tanpa itu printer BLE harus di-pair ulang setelah reload. Profil service yang dikenal: `18f0`, `e7810a71…`, `49535343…` (ISSC), `ff00`, `ae30`.
- **WebUSB**: untuk Android. Di Windows driver printer OS memegang device (butuh WinUSB/Zadig) — tetap pakai dialog sistem atau Print Bridge.
- **Epson ePOS**: halaman HTTPS hanya bisa memanggil printer lewat HTTPS — buka `https://<ip printer>` sekali di device dan terima sertifikatnya. Star WebPRNT belum (bahasa StarPRNT, format berbeda).

Rancangan awal:

```
features/printing/
├── domain/
│   ├── receipt-document.ts        # Model netral: lines, columns, bold, align, qr, cut
│   ├── builders/
│   │   ├── receipt.builder.ts     # Order → ReceiptDocument (struk pelanggan)
│   │   ├── kitchen-ticket.builder.ts
│   │   └── shift-report.builder.ts
│   └── printer-config.ts          # PrinterConfig, PaperWidth (58|80), Role (receipt|kitchen|bar)
├── application/
│   ├── print.service.ts           # print(job) → pilih driver, render, kirim, retry
│   └── usePrinterSetup.ts         # pairing, test print
└── infrastructure/
    ├── renderers/
    │   ├── escpos.renderer.ts     # ReceiptDocument → Uint8Array (receipt-printer-encoder)
    │   └── html.renderer.ts       # ReceiptDocument → HTML 58/80mm untuk window.print()
    └── drivers/
        ├── printer-driver.ts      # interface
        ├── web-serial.driver.ts   # Bluetooth Classic & USB-serial
        ├── web-bluetooth.driver.ts
        ├── web-usb.driver.ts
        ├── bridge.driver.ts       # HTTP ke Print Bridge lokal → LAN printer
        └── system.driver.ts       # window.print() dengan html renderer
```

### Interface

```ts
// drivers/printer-driver.ts
export type ConnectionType = 'web-serial' | 'web-bluetooth' | 'web-usb' | 'bridge' | 'system';

export interface PrinterDriver {
  readonly type: ConnectionType;
  isSupported(): boolean;
  /** Harus dipanggil dari user gesture saat pertama kali (tombol "Hubungkan printer"). */
  pair(): Promise<PairedDevice>;
  /** Reconnect tanpa dialog ke device yang sudah pernah di-izinkan. */
  connect(device: PairedDevice): Promise<void>;
  send(data: Uint8Array | string): Promise<void>;
  disconnect(): Promise<void>;
}
```

`PrintService` memilih renderer: driver `system` → HTML; selain itu → ESC/POS bytes.

### Library

- `@point-of-sale/receipt-printer-encoder` — encoder ESC/POS & StarPRNT (teks, align, tabel, barcode, QR, gambar/logo, cut, buka laci kas).
- `@point-of-sale/webserial-receipt-printer`, `@point-of-sale/webbluetooth-receipt-printer`, `@point-of-sale/webusb-receipt-printer` — bisa dipakai langsung di dalam driver, atau jadi referensi implementasi.
- Bungkus library pihak ketiga di dalam driver (Adapter pattern) supaya bisa diganti.

## Print Jobs Queue

- Setiap print masuk tabel `printJobs` (Dexie): `{ id, role, documentType, refId, status, attempts, createdAt }`.
- Gagal print **tidak membatalkan transaksi**. Tampilkan toast "Struk gagal dicetak — Coba lagi" + bisa reprint dari halaman Orders.
- Auto-reconnect: saat app start, `connect()` ke printer tersimpan (Web Serial `getPorts()`, Web Bluetooth `getDevices()`, WebUSB `getDevices()`).
- Routing per role: `receipt` → printer kasir, `kitchen` → printer dapur, `bar` → printer minuman. Peran ditentukan per **kategori** di back-office (Menu → Kategori, `categories.print_role`, ikut pull) — berlaku untuk semua outlet brand; kategori `receipt` tidak menghasilkan tiket.
- Printer dapur/bar diatur **per device** di layar Printer: *Tidak dicetak* (default — tidak ada baris di `printers`), *Pakai printer struk* (`driver: "same-as-receipt"`, untuk warung satu printer), atau koneksi sendiri.
- Kapan tiket keluar (Fase 7): bill meja disimpan → hanya unit baru (`OpenBillLine.sentQuantity`, tiket bertanda "TAMBAHAN" bila sebelumnya sudah ada yang dikirim); order dibayar → unit yang belum pernah dikirim (take-away = semua). Stasiun yang gagal cetak tidak ditandai terkirim, jadi dicoba lagi saat simpan/bayar berikutnya; stasiun tanpa printer di device dianggap terkirim. Split bill membagi `sentQuantity` ke bagian yang dibayar lebih dulu. Unit terkirim yang dibatalkan dengan persetujuan manajer (ADR-028) mencetak tiket bertanda **BATAL** (alasan + penyetuju) ke stasiun yang sama; gagal cetak hanya toast.
- Belum: tiket pembatalan item ke dapur (item dikurangi setelah dikirim), cetak ulang tiket dari Riwayat.

## Print Bridge (printer LAN port 9100)

App **`poslite-print-bridge`** (Node.js ≥ 24, tanpa dependency runtime; README di foldernya) di PC kasir atau mini PC outlet: `POST /print { printer: "192.168.1.50:9100", data: base64 }` → socket TCP 9100.
- Halaman HTTPS hanya boleh memanggil `http://localhost` (bridge di PC yang sama) atau bridge HTTPS dengan sertifikat yang dipercaya device (mis. mkcert). Bridge menjawab preflight *Private Network Access* Chrome.
- Auth: shared token per outlet (`BRIDGE_TOKEN`, ≥ 16 karakter, dibandingkan timing-safe); `BRIDGE_ALLOWED_ORIGINS` opsional.
- Tanpa `BRIDGE_PRINTERS` hanya IPv4 privat yang boleh dihubungi (bukan relay terbuka); nama host wajib di daftar izin.
- Job per printer berurutan; error: `401 UNAUTHORIZED`, `403 PRINTER_NOT_ALLOWED`, `502 PRINTER_UNREACHABLE`, `504 PRINTER_TIMEOUT`. Token & isi struk tidak di-log.

## Layout Struk (58mm = 32 kolom, 80mm = 48 kolom)

```
        NAMA RESTORAN             <- header dari settings (bold, center)
     Jl. Contoh No. 1, Jakarta
--------------------------------
No   : JKT01A-260925-0042
Kasir: Budi       25/09/26 11:03
--------------------------------
2x Nasi Gudeg          70.000
   + Tambah Ayam
   * tidak pedas
1x Es Teh Manis         5.000
--------------------------------
Subtotal               75.000
Diskon 10%             -7.500
Service 5%              3.375
PB1 10%                 7.088
TOTAL                  77.963
Tunai                 100.000
Kembali                22.037
--------------------------------
     Terima kasih!               <- footer dari settings
   [QR: link struk digital]      <- opsional
```

Penjualan aplikasi delivery (ADR-029): `GOFOOD #<nomor order>` dicetak tebal di tengah, di bawah header struk dan di bawah judul stasiun pada tiket dapur.

Brand dengan harga termasuk pajak (ADR-030): TOTAL = subtotal − diskon, lalu baris `Termasuk service 5%` dan `Termasuk PB1 10%` di bawah TOTAL (nilainya di dalam total, tidak ditambahkan).

## Checklist Pengujian Printer

- [ ] Test print dari halaman Settings untuk tiap driver
- [ ] Reconnect otomatis setelah printer dimatikan-nyalakan
- [ ] Reconnect setelah app di-restart / tablet reboot
- [ ] Karakter khusus (é, ñ) & codepage
- [ ] Logo (gambar mono) tidak terlalu besar (lambat via Bluetooth — maks ±384px lebar untuk 58mm)
- [ ] Cetak 20 struk berturut-turut (buffer overflow di printer murah → kirim per chunk ±512 byte)
