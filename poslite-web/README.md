# poslite-web

POS PWA **offline-first** untuk restoran (Next.js + TypeScript). Kasir tetap bisa jualan, terima pembayaran, dan cetak struk tanpa internet; `poslite-api` hanya tujuan sinkronisasi.

- Arsitektur: [`docs/architecture/`](docs/architecture/README.md) (symlink ke [`../poslite-docs/`](../poslite-docs/README.md))
- Aturan kerja untuk AI agent & developer: [`AGENTS.md`](AGENTS.md)

## Mulai

Semua perintah `make` dijalankan dari **root monorepo** (satu-satunya Makefile):

```bash
make web-install  # deps
make dev-web      # hanya web: http://localhost:3000  (make dev = API + web)
make web-check    # wajib lulus sebelum commit
```

`make help` menampilkan semua target.

Batas layer (`features/*/{domain,application,infrastructure,components}`) di-enforce oleh `eslint-plugin-boundaries` dan dibuktikan oleh `tests/architecture/boundaries.test.ts`.
