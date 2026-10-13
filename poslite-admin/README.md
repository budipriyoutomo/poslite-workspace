# poslite-admin

Back-office POSLite untuk pemilik/manajer (menu, harga per outlet, kasir & PIN, metode bayar, outlet & perangkat, laporan penjualan). Online-only, memakai `poslite-api`. Lihat ADR-014 di `../poslite-docs/01-system-architecture.md`. Konsol operator SaaS ada di app terpisah, [`../poslite-operator`](../poslite-operator).

- Aturan kerja: [`AGENTS.md`](AGENTS.md)
- Jalankan dari root monorepo: `make dev` (API :8000, POS :3000, back-office http://localhost:3001) atau `make dev-admin`.
- Tipe API: `make admin-types` (dari `poslite-api/openapi.json`).
