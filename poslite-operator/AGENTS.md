# AGENTS.md — poslite-operator

Console for POSLite's SaaS operators (the team running the platform, not tenants): platform
summary, tenants (search, detail, suspend/reactivate, extend a trial, mark an invoice paid), users
across tenants (reset a password, deactivate), operator accounts, and the audit log of every
operator action.
**Online-only**: it talks to `poslite-api` (`/api/v1/platform/*`) directly; no offline storage.
Operator tokens are separate from tenant tokens — they never resolve on tenant endpoints and
vice versa.

Architecture docs: `../poslite-docs/` (01 system & ADR-014, ADR-025, 07 API contract, 09 scope).
Everything in `../poslite-admin/AGENTS.md` applies here (layers, typed API client, TanStack Query,
TDD) **except**:

- The session is an operator session (`features/auth`, `localStorage` key `poslite-operator-session`);
  a 401 signs the operator out. There is no brand context, so no `X-Brand-Id`.
- Every endpoint used here lives under `/api/v1/platform`. Anything a tenant does belongs in
  `poslite-admin`, not here.
- Features: `auth`, `dashboard`, `tenants`, `users`, `operators`, `audit`. Paged lists use
  `unwrapPage` (rows + `meta.total`) and `shared/ui/pager`. Actions that change data ask first
  (`shared/ui/confirm-button`). A reset password is shown once and never stored anywhere.

```bash
pnpm dev          # http://localhost:3002 (API on :8000 — `make dev` runs all apps)
pnpm test         # Vitest + RTL
pnpm e2e          # Playwright against the real API (fresh poslite_e2e_operator database)
pnpm typecheck && pnpm lint && pnpm test   # must pass before "done"
```

Explain plans and summaries to the user in Bahasa Indonesia; code, comments and commits in English.
