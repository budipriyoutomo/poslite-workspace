# AGENTS.md — poslite-web

Instructions for AI coding agents working in this repository. Read this file fully before any task.

## 1. Project

**POSLite** — offline-first Point of Sale PWA for restaurants (Next.js + TypeScript). Cashiers must be able to sell, take payment, and print receipts **with no internet**. The backend (`poslite-api`, Python/FastAPI) is a sync target, not a runtime dependency.

Architecture docs (source of truth — read the relevant one before starting a task):

| Topic | File |
|---|---|
| System overview & ADRs | `docs/architecture/01-system-architecture.md` |
| Frontend structure & layers | `docs/architecture/02-frontend-architecture.md` |
| IndexedDB, outbox, sync | `docs/architecture/03-offline-sync.md` |
| Printing | `docs/architecture/04-printing.md` |
| Domain rules & data model | `docs/architecture/06-domain-and-database.md` |
| API contract | `docs/architecture/07-api-contract.md` |
| Roadmap & DoD | `docs/architecture/08-roadmap-and-testing.md` |

If a task conflicts with these docs, **stop and ask** — do not silently diverge. If a decision changes, update the doc (add an ADR) in the same change.

## 2. Communication

- Explain plans, summaries, and questions to the user in **Bahasa Indonesia**.
- Code, identifiers, comments, commit messages, test names: **English**.

## 3. Commands

```bash
pnpm install
pnpm dev                 # dev server
pnpm test                # Vitest (unit + component + integration), run once
pnpm test:watch          # Vitest watch mode — use during TDD
pnpm test -- <path>      # run a single test file
pnpm test:coverage
pnpm e2e                 # Playwright
pnpm typecheck           # tsc --noEmit
pnpm lint                # ESLint (incl. layer boundaries)
pnpm build               # next build (+ serwist build after the Fase 0 PWA spike)
pnpm api:types           # regenerate src/shared/api/schema.d.ts from ../poslite-api/openapi.json
```

Before declaring any task done: `pnpm typecheck && pnpm lint && pnpm test` must pass.

## 4. TDD Workflow (mandatory)

Every change to behavior follows **Red → Green → Refactor**. No production code without a failing test that requires it.

### The loop

1. **Understand** — restate the behavior in 1–3 bullet points. Identify the layer (domain / application / infrastructure / component).
2. **Test list** — write a short list of test cases (happy path, edge cases, error cases) as a comment or in your plan. Start with the simplest.
3. **RED** — write **one** failing test. Run it. Confirm it fails **for the expected reason** (assertion failure, not a typo/import error). Show the failure output.
4. **GREEN** — write the **minimum** code to pass that test. No extra features, no speculative params. Run the test; it must pass.
5. **REFACTOR** — clean up names, duplication, and layer placement while all tests stay green. Run the full relevant suite.
6. Repeat from step 3 with the next case on the list until the list is empty.
7. Run `pnpm typecheck && pnpm lint && pnpm test`.

### Rules

- Never write a test and its implementation in the same step. Always observe RED first.
- Never modify or delete an existing test to make code pass. If a test is wrong, say so and explain why before changing it.
- Never use `.skip`, `.only`, or `it.todo` in committed code (except `todo` in a test list during work, removed before finishing).
- Bug fix = first a failing test that reproduces the bug, then the fix.
- Keep tests fast and deterministic: fake timers for time, fixed ULIDs/seeds, no real network, no real printer.
- Test **behavior through public API**, not private internals. Don't assert on implementation details (call counts on internal helpers, state shape) unless that is the contract.
- One logical assertion concept per test. Test name describes behavior: `it('caps fixed discount at subtotal')`.

### What to test at which level

| Layer | Tool | Required |
|---|---|---|
| `features/*/domain/**` (pure TS) | Vitest | **100% of rules** — pricing, discount rounding, change calc, cart merge key, receipt number, modifier min/max, shift expected cash |
| `features/*/application/**` (use-cases/hooks) | Vitest + `fake-indexeddb` + fakes via injected deps | Every use-case: success + each failure path (e.g. place order writes order + outbox atomically; print failure does not fail the order) |
| `features/*/infrastructure/**` | Vitest + `fake-indexeddb` / MSW | Repositories, sync engine (accepted / duplicate / rejected / network error / backoff), ESC/POS renderer (byte snapshot) |
| `features/*/components/**` | Vitest + React Testing Library + user-event | User-visible behavior; query by role/label first, `getByTestId` last |
| Critical flows | Playwright | Sell → pay → receipt offline; go online → outbox drains; SW update doesn't reload with non-empty cart |

Printer drivers (Web Serial/Bluetooth/USB) are tested against a **fake driver** implementing `PrinterDriver`; real hardware is a manual checklist (`docs/architecture/04-printing.md`).

### Shared fixtures

`tests/fixtures/pricing-cases.json` is the **same file** as in `poslite-api`. Pricing tests must iterate over it so frontend and backend compute identical totals. Never edit it here only — change `poslite-api/tests/fixtures/pricing-cases.json` in the same commit. Money math is **integer-only** (ADR-005): rates are basis points (`serviceBps`, `taxBps`), percentage discounts are integers 0..100, and the only rounding function is `divRoundHalfUp(n, d)` in `shared/money` (mirrors `div_round_half_up` in the backend). Keep exact `.5` cases in the fixture.

### Example

```ts
// RED — features/checkout/domain/pricing.test.ts
it('caps fixed discount at subtotal', () => {
  const r = calculate([{ unitPrice: 5000, modifiersTotal: 0, quantity: 1 }],
    { type: 'fixed', value: 10000 }, { serviceBps: 0, taxBps: 0 });
  expect(r.discountAmount).toBe(5000);
  expect(r.total).toBe(0);
});
// run → FAIL (expected 5000, received 10000)
// GREEN → add Math.min(rawDiscount, subtotal)
// REFACTOR → extract discountAmount(), rerun suite
```

## 5. Architecture Rules

Folder layout (see `02-frontend-architecture.md`):

```
src/app/                 routing only — no business logic
src/features/<feature>/  domain/ application/ infrastructure/ components/
src/shared/              db/ api/ money/ id/ hooks/ ui/
```

Dependency direction (enforced by ESLint boundaries):
- `components` → `application` → `domain`
- `application` → `infrastructure` **only through interfaces**, injected (default deps param or provider)
- `domain` imports **nothing** from React, Dexie, Next, fetch, or `window`
- Features don't import another feature's internals — only its `index.ts` public API

## 6. Non-Negotiable Domain Rules

- **Offline-first**: every cashier action writes to Dexie + outbox in **one Dexie transaction**. UI never awaits the network for selling.
- **Money is integer Rupiah** (`number`, no decimals). Never `parseFloat` for money. Rates are integer basis points. Rounding only via `divRoundHalfUp` in `shared/money` — no `Math.round(x * rate)` on floats.
- **`order.placed` carries the rates snapshot** (`rates.service_bps`, `rates.tax_bps`) used at sale time (ADR-011).
- Sync results `accepted`, `duplicate` and `flagged` all mean **stored on the server** → remove from outbox. Only `rejected` becomes `dead`.
- **IDs are ULIDs generated on the client** via `shared/id/newId()`. Never use auto-increment or `array.length + 1`.
- **Paid orders are immutable.** Corrections = void event referencing the original order.
- **Order lines snapshot** product name, price, modifier names/prices at sale time.
- **Master data is read-only on device** (products, prices, users, payment methods) — only changed by sync pull.
- A failed print must never fail or roll back a transaction.
- Never `db.delete()` or clear the outbox on logout.

## 7. Code Style

- TypeScript `strict`. No `any` — use `unknown` + narrowing or Zod. No `@ts-ignore` (use `@ts-expect-error` with reason, only in tests).
- Validate all external data (API responses, sync payloads, IndexedDB rows after migration) with Zod.
- POS screens are Client Components prerendered statically. **No** Server Actions, RSC data fetching, or dynamic route segments in the POS app (breaks offline — ADR-002). Use query params / state instead.
- No `alert()`/`confirm()` — use `sonner` toast and shadcn `Dialog`.
- Components ≤ ~150 lines; extract hooks for logic. No prop drilling beyond 2 levels.
- Naming: components `PascalCase.tsx`, others `kebab-case.ts`, hooks `useX`, booleans `isX/hasX`, handlers `onX/handleX`.
- UI text in Bahasa Indonesia; keep strings in one place per feature (`copy.ts`) for future i18n.
- Dexie schema changes: add a new `version(n)` with `upgrade()`; never edit an existing version.

## 8. Git

- Small commits, one behavior each. Prefer committing at green after refactor.
- Conventional Commits: `feat(checkout): cap fixed discount at subtotal`, `test(sync): cover duplicate event result`, `fix(cart): …`, `refactor(…)`.
- Don't commit generated files except `schema.d.ts`. Never commit secrets or `.env*` (except `.env.example`).

## 9. Definition of Done

- [ ] Tests written first; RED was observed; all tests green
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass
- [ ] Works offline (or explicitly disabled offline with a clear message)
- [ ] Money integer end-to-end; IDs are ULIDs
- [ ] No layer-boundary violations
- [ ] Docs/ADR updated if a decision changed
- [ ] Summary to user (in Bahasa Indonesia): what changed, tests added, anything not done

## 10. When to Stop and Ask

- Requirement is ambiguous or contradicts `docs/architecture/*`
- A change needs a new dependency (state why + bundle size impact)
- A change touches the sync payload / API contract (must be coordinated with `poslite-api`)
- A test you did not write seems wrong
- You would need to disable a lint rule, type check, or test

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
