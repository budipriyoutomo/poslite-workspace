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

```bash
make setup    # sekali: deps, .env, role + database poslite/poslite_test, migrasi
make dev      # API http://localhost:8000 + web http://localhost:3000 (Ctrl-C menghentikan keduanya)
make check    # lint, typecheck, test di api & web
make test     # test saja
```

Target per app tetap bisa dipakai langsung: `make -C poslite-api help`, `make -C poslite-web help`.
