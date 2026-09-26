# poslite-admin

Back-office POSLite untuk pemilik/manajer (menu, harga per outlet, kasir & PIN, metode bayar, outlet & perangkat, laporan penjualan) dan konsol operator SaaS (`/platform`). Online-only, memakai `poslite-api`. Lihat ADR-014 di `../poslite-docs/01-system-architecture.md`.

- Aturan kerja: [`AGENTS.md`](AGENTS.md)
- Jalankan dari root monorepo: `make dev` (API :8000, POS :3000, back-office http://localhost:3001) atau `make dev-admin`.
- Tipe API: `make admin-types` (dari `poslite-api/openapi.json`).
