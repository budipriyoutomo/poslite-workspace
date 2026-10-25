# poslite-print-bridge

Aplikasi kecil di jaringan outlet yang meneruskan cetakan dari POSLite (PWA) ke printer LAN/Wi-Fi di port **9100** (raw ESC/POS). Browser tidak bisa membuka koneksi TCP sendiri, jadi POS mengirim `POST /print` ke bridge dan bridge yang menghubungi printer (lihat `poslite-docs/04-printing.md`).

Tanpa dependency runtime — hanya Node.js ≥ 24 (TypeScript dijalankan langsung oleh Node).

## Menjalankan

```bash
node src/main.ts
# POSLite Print Bridge 0.1.0 on http://127.0.0.1:9180
# Pairing code and test print: http://localhost:9180/ (this PC only)
```

Tanpa `BRIDGE_TOKEN`, bridge membuat token sendiri sekali dan menyimpannya di `~/.poslite-bridge-token` (hanya bisa dibaca user itu). Buka **http://localhost:9180/** di PC yang sama: halaman itu menampilkan **kode pairing 6 digit** (berganti tiap 5 menit, satu kode untuk satu perangkat; 5 kode salah mengunci pairing 5 menit), daftar printer, tombol test print, dan error cetak terakhir (tanpa isi struk). Halaman dan test print hanya melayani PC itu sendiri.

Di POS: menu **Printer** → pilih *Printer LAN lewat Print Bridge* → isi alamat bridge → isi **Kode pairing** → **Pasangkan** (token terisi sendiri) → isi alamat printer (`192.168.1.50:9100`) → **Simpan alamat** → **Test print**.

| Variabel | Default | Arti |
|---|---|---|
| `BRIDGE_TOKEN` | dibuat sendiri | Rahasia per outlet (≥ 16 karakter bila diisi); POS mengirimnya sebagai `Authorization: Bearer …`, didapat lewat pairing |
| `BRIDGE_TOKEN_FILE` | `~/.poslite-bridge-token` | Tempat token buatan bridge disimpan |
| `BRIDGE_HOST` | `127.0.0.1` | `0.0.0.0` agar tablet lain di LAN bisa memakai bridge |
| `BRIDGE_PORT` | `9180` | Port bridge |
| `BRIDGE_TLS_CERT`, `BRIDGE_TLS_KEY` | — | File PEM; bila diisi bridge melayani HTTPS |
| `BRIDGE_ALLOWED_ORIGINS` | semua | Origin POS yang boleh memanggil, dipisah koma (mis. `https://pos.poslite.id`) |
| `BRIDGE_PRINTERS` | IP privat saja | Daftar izin `host:port`, dipisah koma — wajib bila printer memakai nama host |

## HTTPS atau localhost?

POSLite berjalan di HTTPS, dan browser hanya mengizinkan halaman HTTPS memanggil:

- **`http://localhost`** — bridge berjalan di **PC kasir yang sama** (Windows/Linux). Paling mudah, tanpa sertifikat.
- **`https://…`** — bridge di mini PC / PC lain dan dipakai **tablet**. Buat sertifikat yang dipercaya tablet, mis. dengan [mkcert](https://github.com/FiloSottile/mkcert): `mkcert -install && mkcert bridge.local 192.168.1.10`, lalu pasang CA mkcert di tablet, dan jalankan dengan `BRIDGE_HOST=0.0.0.0 BRIDGE_TLS_CERT=… BRIDGE_TLS_KEY=…`.

Bridge menjawab preflight *Private Network Access* Chrome (`Access-Control-Allow-Private-Network`).

## API

- `GET /health` → `200 {"ok":true,"version":"0.1.0"}` (tanpa token)
- `POST /print` `{"printer":"192.168.1.50:9100","data":"<base64 ESC/POS>"}` dengan `Authorization: Bearer <token>`
  - `200 {"ok":true}` · `400 BAD_REQUEST` · `401 UNAUTHORIZED` · `403 PRINTER_NOT_ALLOWED` / `ORIGIN_NOT_ALLOWED` · `413 TOO_LARGE` (> 1 MB) · `502 PRINTER_UNREACHABLE` · `504 PRINTER_TIMEOUT`

Job ke printer yang sama dikerjakan berurutan (dua tablet tidak saling menyela). Token dan isi struk tidak pernah dicatat di log.

## Keamanan

- Tanpa `BRIDGE_PRINTERS`, bridge hanya mau menghubungi IPv4 privat (10/8, 172.16/12, 192.168/16, 127/8), jadi token yang bocor tidak menjadikannya relay ke internet.
- Satu token per outlet; ganti token = ganti `BRIDGE_TOKEN` dan isi ulang di layar Printer tiap device.

## Pengembangan

```bash
make bridge-check   # dari root monorepo: typecheck + test
pnpm test           # node --test
pnpm typecheck
```

Menjalankan sebagai layanan: Windows → [NSSM](https://nssm.cc/) (`nssm install POSLiteBridge "C:\Program Files\nodejs\node.exe" C:\poslite-print-bridge\src\main.ts`, set variabel di tab *Environment*); Linux → unit systemd dengan `Environment=BRIDGE_TOKEN=…`.
