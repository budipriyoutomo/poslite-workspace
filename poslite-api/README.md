# poslite-api

Backend POSLite (Python · FastAPI · PostgreSQL). Tujuan sinkronisasi untuk POS PWA offline-first dan API back-office multi-tenant.

- Arsitektur: [`docs/architecture/`](docs/architecture/README.md) (symlink ke [`../poslite-docs/`](../poslite-docs/README.md))
- Aturan kerja untuk AI agent & developer: [`AGENTS.md`](AGENTS.md)

## Mulai

Butuh PostgreSQL lokal (mis. Homebrew) yang jalan di `localhost:5432` dengan user OS Anda sebagai superuser. Development **tidak** memakai Docker.

Semua perintah `make` dijalankan dari **root monorepo** (satu-satunya Makefile):

```bash
make setup      # sekali di awal: deps, .env, role + DB lokal, migrasi
make dev-api    # hanya API: http://localhost:8000/api/v1/health  (make dev = API + web)
make migrate    # terapkan migrasi; make migration m="..." untuk membuat baru
make api-check  # wajib lulus sebelum commit
```

`make help` menampilkan semua target.
