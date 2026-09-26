# POSLite

Monorepo POSLite: POS PWA offline-first untuk restoran. Backend dan frontend dijalankan bersamaan **tanpa Docker** — PostgreSQL memakai instalasi lokal.

## Struktur

```
poslite/
├── Makefile          ← titik masuk development (api + web sekaligus)
├── .github/workflows api.yml & web.yml (jalan hanya saat foldernya berubah)
├── poslite-api/      FastAPI · uv · Alembic
├── poslite-web/      Next.js PWA · pnpm
└── poslite-docs/     dokumen arsitektur (sumber tunggal; di-symlink ke */docs/architecture)
```

## Prasyarat

- `uv`, `pnpm`, dan PostgreSQL lokal (mis. `brew install postgresql && brew services start postgresql`) dengan user OS Anda sebagai superuser.
- `make doctor` mengecek semuanya.

## Pemakaian

Hanya ada **satu Makefile** (di root). Jalankan `make help` untuk daftar lengkap.

```bash
make setup                   # sekali: deps, .env, role + database poslite/poslite_test, migrasi
make dev                     # API http://localhost:8000 + web http://localhost:3000 (Ctrl-C menghentikan keduanya)
make dev-api / make dev-web  # jalankan salah satu saja
make check                   # lint, typecheck, test di api & web (api-check / web-check untuk salah satu)
make test                    # test saja
make fmt                     # auto-fix lint & format Python
make worker                  # relay outbox → laporan (butuh Redis lokal)
make web-e2e PW_CHANNEL=chrome        # Playwright (web saja, mode demo)
make e2e-fullstack PW_CHANNEL=chrome  # browser + API asli di database poslite_e2e
```

Perangkat baru membuka `/activate`: manajer login lalu memilih outlet (butuh API berjalan), atau pilih **Coba mode demo** untuk berjualan offline tanpa server (Siti 1234 · Budi 9999). Buat tenant pertama lewat `POST /api/v1/tenants/signup` (lihat http://localhost:8000/docs).

Database (PostgreSQL lokal):

```bash
make migrate                 # alembic upgrade head
make migration m="add orders"  # autogenerate migrasi baru (review filenya!)
make migrate-down            # rollback satu migrasi
make db-reset                # drop + buat ulang + migrasi (minta konfirmasi)
```

Port & kredensial bisa di-override, mis. `make dev API_PORT=8001 WEB_PORT=3001`.
