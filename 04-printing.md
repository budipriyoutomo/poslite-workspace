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
- Routing per role: `receipt` → printer kasir, `kitchen` → printer dapur (item kategori makanan), `bar` → printer minuman. Mapping kategori → role di setting outlet.

## Print Bridge (opsional, untuk printer LAN)

Aplikasi kecil di jaringan lokal (mis. Node/Go di mini PC atau PC kasir) yang menerima `POST /print { printer: "192.168.1.50:9100", data: base64 }` dan meneruskan ke socket TCP 9100.
- Wajib HTTPS (sertifikat lokal) atau akses via `localhost` agar tidak diblok mixed content.
- Auth dengan shared token per outlet.
- Ditunda ke fase lanjut kecuali restoran sudah pakai printer LAN.

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

## Checklist Pengujian Printer

- [ ] Test print dari halaman Settings untuk tiap driver
- [ ] Reconnect otomatis setelah printer dimatikan-nyalakan
- [ ] Reconnect setelah app di-restart / tablet reboot
- [ ] Karakter khusus (é, ñ) & codepage
- [ ] Logo (gambar mono) tidak terlalu besar (lambat via Bluetooth — maks ±384px lebar untuk 58mm)
- [ ] Cetak 20 struk berturut-turut (buffer overflow di printer murah → kirim per chunk ±512 byte)
