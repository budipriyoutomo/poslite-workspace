# poslite-web

POS PWA **offline-first** untuk restoran (Next.js + TypeScript). Kasir tetap bisa jualan, terima pembayaran, dan cetak struk tanpa internet; `poslite-api` hanya tujuan sinkronisasi.

- Arsitektur: [`docs/architecture/`](docs/architecture/README.md) (symlink ke [`../poslite-docs/`](../poslite-docs/README.md))
- Aturan kerja untuk AI agent & developer: [`AGENTS.md`](AGENTS.md)

## Mulai

```bash
make install
make dev          # http://localhost:3000
```

`make help` menampilkan semua target. Untuk menjalankan frontend + backend sekaligus, pakai `make dev` di root monorepo.

## Cek sebelum commit

```bash
make check
```

Batas layer (`features/*/{domain,application,infrastructure,components}`) di-enforce oleh `eslint-plugin-boundaries` dan dibuktikan oleh `tests/architecture/boundaries.test.ts`.
