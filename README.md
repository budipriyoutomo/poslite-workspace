# poslite-workspace

Titik masuk development lokal POSLite. Menjalankan backend (`poslite-api`) dan frontend (`poslite-web`) bersamaan **tanpa Docker** — PostgreSQL memakai instalasi lokal.

## Struktur folder

```
~/Project/Personal/
├── poslite-workspace/   ← repo ini (Makefile)
├── poslite-api/         FastAPI
├── poslite-web/         Next.js PWA
└── poslite-docs/        arsitektur (submodule di api & web)
```

## Prasyarat

- `uv`, `pnpm`, dan PostgreSQL lokal (mis. `brew install postgresql && brew services start postgresql`) dengan user OS Anda sebagai superuser.
- `make doctor` mengecek semuanya.

## Pemakaian

```bash
make setup    # sekali: deps, .env, role + database poslite/poslite_test, migrasi
make dev      # API http://localhost:8000 + web http://localhost:3000 (Ctrl-C menghentikan keduanya)
make check    # lint, typecheck, test di kedua repo
make status   # git status semua repo POSLite
```

Target per repo tetap bisa dipakai langsung: `make -C ../poslite-api help`, `make -C ../poslite-web help`.
