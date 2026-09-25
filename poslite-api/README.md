# poslite-api

Backend POSLite (Python · FastAPI · PostgreSQL). Tujuan sinkronisasi untuk POS PWA offline-first dan API back-office multi-tenant.

- Arsitektur: [`docs/architecture/`](docs/architecture/README.md) (symlink ke [`../poslite-docs/`](../poslite-docs/README.md))
- Aturan kerja untuk AI agent & developer: [`AGENTS.md`](AGENTS.md)

## Mulai

Butuh PostgreSQL lokal (mis. Homebrew) yang jalan di `localhost:5432` dengan user OS Anda sebagai superuser. Development **tidak** memakai Docker.

```bash
make install env db-setup migrate   # sekali di awal
make dev                            # http://localhost:8000/api/v1/health
```

`make help` menampilkan semua target. Untuk menjalankan frontend + backend sekaligus, pakai `make dev` di root monorepo.

## Cek sebelum commit

```bash
make check
```
