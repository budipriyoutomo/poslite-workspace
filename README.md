# POSLite

Monorepo POSLite: POS PWA offline-first untuk restoran. Backend dan frontend dijalankan bersamaan **tanpa Docker** — PostgreSQL memakai instalasi lokal.

## Struktur

```
poslite/
├── Makefile          ← titik masuk development (api + web + admin sekaligus)
├── .github/workflows api.yml, web.yml & admin.yml (jalan hanya saat foldernya berubah)
├── poslite-api/      FastAPI · uv · Alembic
├── poslite-web/      Next.js PWA kasir (offline-first) · pnpm
├── poslite-admin/    Next.js back-office pemilik + konsol platform (online) · pnpm
└── poslite-docs/     dokumen arsitektur (sumber tunggal; di-symlink ke */docs/architecture)
```

## Prasyarat

- `uv`, `pnpm`, dan PostgreSQL lokal (mis. `brew install postgresql && brew services start postgresql`) dengan user OS Anda sebagai superuser.
- Redis lokal hanya untuk `make worker` (proyeksi laporan): `brew install redis && brew services start redis`.
- `make doctor` mengecek semuanya.

## Pemakaian

Hanya ada **satu Makefile** (di root). Jalankan `make help` untuk daftar lengkap.

```bash
make setup                   # sekali: deps, .env, role + database poslite/poslite_test, migrasi
make dev                     # API :8000 + kasir http://localhost:3000 + back-office http://localhost:3001 (Ctrl-C menghentikan semua)
make dev-api / dev-web / dev-admin  # jalankan salah satu saja
make check                   # lint, typecheck, test di semua app (api-check / web-check / admin-check)
make test                    # test saja
make fmt                     # auto-fix lint & format Python
make worker                  # relay outbox → laporan (butuh Redis lokal)
make web-e2e PW_CHANNEL=chrome        # Playwright (web saja, mode demo)
make e2e-fullstack PW_CHANNEL=chrome  # browser + API asli di database poslite_e2e
make admin-e2e PW_CHANNEL=chrome      # back-office + API asli di database poslite_e2e_admin
make openapi && make admin-types      # kontrak API → openapi.json → tipe TS back-office
make report-rebuild from=2026-09-01 to=2026-09-30  # hitung ulang tabel laporan
make platform-admin email=ops@x.id name=Ops       # akun operator SaaS (konsol /platform)
```

Perangkat baru membuka `/activate`: manajer login lalu memilih outlet (butuh API berjalan), atau pilih **Coba mode demo** untuk berjualan offline tanpa server (Siti 1234 · Budi 9999). Buat tenant pertama di back-office http://localhost:3001/signup (usaha + owner + outlet pertama), lalu siapkan menu, harga, kasir & PIN di sana.

Database (PostgreSQL lokal):

```bash
make migrate                 # alembic upgrade head
make migration m="add orders"  # autogenerate migrasi baru (review filenya!)
make migrate-down            # rollback satu migrasi
make db-reset                # drop + buat ulang + migrasi (minta konfirmasi)
```

Port & kredensial bisa di-override, mis. `make dev API_PORT=8001 WEB_PORT=3002`.
