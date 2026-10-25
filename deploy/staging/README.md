# Staging — runbook

Topologi (doc [01 — Deployment](../../poslite-docs/01-system-architecture.md#deployment-awal)):

| Komponen | Di mana | Domain |
|---|---|---|
| API (gunicorn + uvicorn), worker arq, PostgreSQL 16, Redis, Caddy (HTTPS otomatis) | 1 VPS, `docker compose` di folder ini | `API_DOMAIN` |
| POS PWA (`poslite-web`) | Vercel, project sendiri | `POS_DOMAIN` |
| Back-office (`poslite-admin`) | Vercel, project sendiri | `ADMIN_DOMAIN` |
| Konsol operator SaaS (`poslite-operator`) | Vercel, project sendiri | `OPERATOR_DOMAIN` |

Payment gateway di staging = **FakeGateway** (vendor belum dipilih, ADR-017). Halaman checkout palsunya bisa melunasi tagihan oleh siapa saja yang tahu URL-nya — **jangan dipakai untuk production**.

## 1. VPS (API)

Prasyarat: Ubuntu 24.04 (atau sejenis), min. 2 vCPU / 4 GB RAM, Docker Engine + plugin compose, port 80/443 terbuka, DNS A `API_DOMAIN` → IP VPS.

```bash
git clone <repo> /opt/poslite && cd /opt/poslite/deploy/staging
cp .env.example .env && chmod 600 .env
# isi .env: domain, ACME_EMAIL, password & GATEWAY_SECRET masing-masing dari `openssl rand -hex 24`
docker compose up -d --build
docker compose ps                 # migrate = exited (0); api, worker, postgres, redis, caddy = running/healthy
curl https://$API_DOMAIN/api/v1/health
```

Image `poslite-api:staging` selalu di-build di VPS dari `../../poslite-api` (service `migrate`, `pull_policy: build`); `api` dan `worker` memakai image lokal itu (`pull_policy: never`) — tidak ada yang di-pull dari Docker Hub. Karena itu VPS harus clone **monorepo** (bukan repo per-app).

Urutan start: `postgres` → `migrate` (`alembic upgrade head`, sekali jalan) → `api` + `worker` → `caddy`. Role database (`poslite`, `poslite_app`, `poslite_system`, ADR-013) dibuat oleh `initdb/01-roles.sh` hanya saat volume `postgres` masih kosong.

Akun operator SaaS (untuk `poslite-operator`), password diminta tanpa echo:

```bash
docker compose exec -it api python -m poslite.platform_admin create-admin ops@domain.id "Ops"
```

## 2. Vercel (POS, back-office & konsol operator)

Buat **tiga project** dari repo yang sama:

| Setting | POS | Back-office | Konsol operator |
|---|---|---|---|
| Root Directory | `poslite-web` | `poslite-admin` | `poslite-operator` |
| Framework | Next.js (dari `vercel.json`) | Next.js | Next.js |
| Env `NEXT_PUBLIC_API_URL` | `https://<API_DOMAIN>/api/v1` | — | — |
| Env `NEXT_PUBLIC_API_ORIGIN` | — | `https://<API_DOMAIN>` | `https://<API_DOMAIN>` |
| Env `NEXT_PUBLIC_DEMO_ENABLED` | `false` untuk POS tenant · `true` hanya untuk situs demo penjualan | — | — |
| Env `ENABLE_EXPERIMENTAL_COREPACK` | `1` (pakai pnpm sesuai `packageManager`) | `1` | `1` |
| Node.js | 24.x | 24.x | 24.x |
| Domain | `POS_DOMAIN` | `ADMIN_DOMAIN` | `OPERATOR_DOMAIN` |

Env `NEXT_PUBLIC_*` dibaca saat **build** — setelah mengubahnya, redeploy. `vercel.json` melewati build bila folder app tidak berubah. Domain ketiga app harus sama persis dengan `POS_DOMAIN`/`ADMIN_DOMAIN`/`OPERATOR_DOMAIN` di `.env` VPS (CORS). Konsol operator sebaiknya juga dilindungi di Vercel (Deployment Protection / allowlist IP) karena hanya untuk tim internal.

## 3. Verifikasi setelah deploy

1. `https://<API_DOMAIN>/api/v1/health` → `status: ok`.
2. `https://<POS_DOMAIN>/sw.js` → 200 (service worker hasil `serwist build`; tanpa ini POS tidak bisa offline).
3. Back-office: signup perusahaan → login → buat menu, harga outlet, kasir + PIN, metode bayar.
4. Konsol operator (`https://<OPERATOR_DOMAIN>`): login akun operator → tenant baru tampil → tangguhkan → back-office menolak tulis → aktifkan lagi.
5. POS di tablet: aktivasi device → buka shift → mode pesawat → jual → reload (app tetap terbuka) → online lagi → order muncul di laporan back-office (worker merelay outbox tiap 5 detik).
6. QRIS dinamis & tagihan langganan: buka `payment_url` → tombol bayar di checkout palsu → status lunas.
7. Webhook keluar: daftarkan endpoint uji (mis. webhook.site) → jual → `order.placed` terkirim dengan tanda tangan HMAC.

## 4. Deploy ulang (API)

```bash
cd /opt/poslite && git pull && cd deploy/staging
docker compose up -d --build      # migrate jalan lagi sebelum api/worker start
docker image prune -f
```

Migrasi bersifat maju; rollback = `docker compose run --rm migrate alembic downgrade -1` lalu checkout versi lama. Naikkan `MIN_APP_VERSION` hanya bila payload sync berubah tidak kompatibel (device lama mendapat 426).

## 5. Backup & restore

`backup.sh` membuat dump PostgreSQL (`pg_dump -Fc`) dan arsip volume media, menyimpan 14 hari. Pasang di cron VPS (lihat header script) dan salin `BACKUP_DIR` ke luar VPS (object storage / mesin lain).

Restore ke database kosong:

```bash
docker compose stop api worker
docker compose exec -T postgres pg_restore -U postgres -d poslite --clean --if-exists < poslite-<stamp>.dump
docker compose start api worker
```

Uji restore minimal sekali sebelum pilot.

## 6. Catatan operasional

- Log: `docker compose logs -f api worker` (rotasi 5 × 10 MB per container).
- Gambar produk: `MEDIA_STORAGE=local` menyimpan di volume `media` dan disajikan API di `/media`; untuk IDCloudHost Object Storage isi variabel `S3_*` + `MEDIA_PUBLIC_BASE_URL` (ADR-021).
- Billing job harian jalan 01:00 UTC (08:00 WIB) di worker; `PRICE_PER_OUTLET` = harga per outlet per bulan.
- Ukur NFR di perangkat asli selama pilot (doc [08](../../poslite-docs/08-roadmap-and-testing.md)): waktu buka app offline, waktu bayar, durasi sync setelah offline lama.
