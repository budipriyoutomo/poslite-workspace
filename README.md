# poslite-web

POS PWA **offline-first** untuk restoran (Next.js + TypeScript). Kasir tetap bisa jualan, terima pembayaran, dan cetak struk tanpa internet; `poslite-api` hanya tujuan sinkronisasi.

- Arsitektur: [`docs/architecture/`](docs/architecture/README.md) (git submodule `poslite-docs`)
- Aturan kerja untuk AI agent & developer: [`AGENTS.md`](AGENTS.md)

## Mulai

```bash
git submodule update --init
pnpm install
pnpm dev
```

## Cek sebelum commit

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Batas layer (`features/*/{domain,application,infrastructure,components}`) di-enforce oleh `eslint-plugin-boundaries` dan dibuktikan oleh `tests/architecture/boundaries.test.ts`.
