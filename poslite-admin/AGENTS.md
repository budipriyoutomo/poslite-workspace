# AGENTS.md — poslite-admin

Back-office web for POSLite owners/managers (menu, prices, users, outlets & devices, sales
reports) and the SaaS operator console (`/platform`). **Online-only**: it talks to `poslite-api`
directly; no offline storage, no service worker.

Architecture docs: `../poslite-docs/` (01 system & ADR-014, 07 API contract, 08 roadmap).
Everything in `../poslite-web/AGENTS.md` applies here (TDD loop, layers, code style, git, DoD,
when to ask) **except**:

- No Dexie/outbox/offline rules — server data via **TanStack Query**; the API is the source of truth.
- API calls go through the typed client (`src/shared/api`), generated from `poslite-api/openapi.json`
  (`pnpm api:types`, run `make openapi` in the API first). Never hand-write request/response types.
- Money is still integer Rupiah (inputs parse digits only; display with `formatRupiah`).
- The back-office token lives in `localStorage` (12 h, opaque, revocable). A 401 logs the user out.

```bash
pnpm dev          # http://localhost:3001 (API on :8000 — `make dev` runs all three apps)
pnpm test         # Vitest + RTL
pnpm e2e          # Playwright against the real API (fresh poslite_e2e database)
pnpm typecheck && pnpm lint && pnpm test   # must pass before "done"
```

Explain plans and summaries to the user in Bahasa Indonesia; code, comments and commits in English.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
