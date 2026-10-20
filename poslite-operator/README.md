# poslite-operator

Konsol operator SaaS POSLite: ringkasan platform, tenant (cari, detail, tangguhkan/aktifkan, perpanjang trial, tandai tagihan lunas), user lintas tenant (reset password, nonaktifkan), akun operator, dan audit log. Online-only, memakai `poslite-api` (`/api/v1/platform/*`). Lihat ADR-025 di `../poslite-docs/01-system-architecture.md`.

- Aturan kerja: [`AGENTS.md`](AGENTS.md)
- Jalankan dari root monorepo: `make dev` (API :8000, POS :3000, back-office :3001, operator http://localhost:3002) atau `make dev-operator`.
- Akun operator: `make platform-admin email=ops@x.id name=Ops`.
- Tipe API: `make operator-types` (dari `poslite-api/openapi.json`)
