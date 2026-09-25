# AGENTS.md — poslite-api

Instructions for AI coding agents working in this repository. Read this file fully before any task.

## 1. Project

**POSLite API** — Python/FastAPI backend for an offline-first restaurant POS. POS devices create transactions offline and push them later via `POST /api/v1/sync/push`; they pull master data via `GET /api/v1/sync/pull`. A back-office web app manages menu, prices, users, outlets, and reports.

Architecture docs (source of truth — read the relevant one before starting a task):

| Topic | File |
|---|---|
| System overview & ADRs | `docs/architecture/01-system-architecture.md` |
| Offline sync, idempotency, conflicts | `docs/architecture/03-offline-sync.md` |
| Backend modules, layers, stack | `docs/architecture/05-backend-architecture.md` |
| Domain rules & schema | `docs/architecture/06-domain-and-database.md` |
| API contract | `docs/architecture/07-api-contract.md` |
| Roadmap & DoD | `docs/architecture/08-roadmap-and-testing.md` |

If a task conflicts with these docs, **stop and ask**. If a decision changes, update the doc (add an ADR) in the same change.

## 2. Communication

- Explain plans, summaries, and questions to the user in **Bahasa Indonesia**.
- Code, identifiers, docstrings, comments, commit messages, test names: **English**.

## 3. Stack & Commands

Python 3.12+ · FastAPI · Pydantic v2 · SQLAlchemy 2.0 async (asyncpg) · Alembic · PostgreSQL 16 · Redis · arq · uv · ruff · mypy --strict · pytest.

```bash
# `make` targets live only in the monorepo root Makefile — run them from the repo root.
make setup                                     # first time: deps, .env, local Postgres role + dev/test DBs, migrations
make dev-api                                   # API on :8000 (local PostgreSQL, no Docker); `make dev` = API + web
make migrate                                   # alembic upgrade head; `make migration m="..."` to autogenerate
make api-check                                 # everything below that must pass before "done"
uv run arq poslite.worker.WorkerSettings       # background worker (needs local Redis — Fase 2)

uv run pytest                                  # all tests
uv run pytest tests/unit                       # fast, no DB
uv run pytest tests/unit/sales -k "fixed_discount"   # single test
uv run pytest -x --ff                          # stop on first failure, failed-first (TDD loop)
uv run pytest --cov=poslite --cov-fail-under=85
uv run ruff check . && uv run ruff format --check .
uv run mypy src
uv run lint-imports                            # import-linter: layer & module boundaries
uv run alembic revision --autogenerate -m "..."   # then REVIEW the file
uv run python -m poslite.tools.export_openapi  # write openapi.json
```

Before declaring any task done:
`uv run ruff check . && uv run ruff format --check . && uv run mypy src && uv run lint-imports && uv run pytest` must pass.

## 4. TDD Workflow (mandatory)

Every change to behavior follows **Red → Green → Refactor**. No production code without a failing test that requires it.

### The loop

1. **Understand** — restate the behavior in 1–3 bullet points. Identify module and layer (domain / application / infrastructure / presentation).
2. **Test list** — list test cases (happy path, edge cases, invariant violations, auth/permission failures). Start with the simplest.
3. **RED** — write **one** failing test. Run it. Confirm it fails **for the expected reason** (assertion error — not `ImportError`/`NameError`/fixture typo). Show the failure output.
4. **GREEN** — write the **minimum** code to pass. No speculative fields, params, or endpoints.
5. **REFACTOR** — improve names, extract value objects/services, fix layer placement; keep all tests green. Run the module's test folder.
6. Repeat from step 3 until the test list is empty.
7. Run the full check command from §3.

### Rules

- Never write a test and its implementation in the same step. Always observe RED first.
- Never weaken or delete an existing test to make code pass. If a test is wrong, explain why before changing it.
- No `pytest.mark.skip`, `xfail`, or `-k` exclusions left in committed code.
- Bug fix = first a failing test that reproduces the bug.
- **Unit tests must not touch DB, network, filesystem, or real time.** If a domain/use-case test needs a database, the design is coupled — fix the design.
- Deterministic: inject a `Clock` protocol (no `datetime.now()` in domain/application), fixed ULIDs, seeded data. Use in-memory fakes (e.g. `InMemoryOrderRepository`, `FakeUnitOfWork`) rather than deep `MagicMock` chains.
- Prefer **fakes over mocks** for repositories/UoW; use `AsyncMock(spec=...)` only for ports to external services.
- Test behavior via public API (entity methods, use-case `__call__`, HTTP endpoints), not private helpers.
- Test names describe behavior: `test_caps_fixed_discount_at_subtotal`, `test_push_marks_replayed_event_as_duplicate`.

### What to test at which level

| Layer | Folder | Tooling | Required |
|---|---|---|---|
| `domain/` (entities, value objects, services) | `tests/unit/<module>/` | pytest, no fixtures from DB | 100% of invariants: `Money`, `div_round_half_up`, `Discount`, `PriceCalculator`, Order paid/void rules, change calc, Shift expected cash & variance, `ReceiptNumber` |
| `application/` (use cases, handlers) | `tests/unit/<module>/` | pytest-asyncio + `FakeUnitOfWork` | Each use case: success + every rejection path + domain events emitted + **never calls `commit()`** |
| `infrastructure/` (SQLAlchemy repos, UoW, outbox relay, projectors, `version` trigger) | `tests/integration/<module>/` | local **PostgreSQL** test DB `poslite_test` via `TEST_*DATABASE_URL` (app / migration / system roles; not SQLite); schema built by the real migrations once per session, tests commit for real, all tables truncated after each test | Mapping round-trip, UoW rollback on error, savepoint rollback discards its domain events, outbox rows written in the same transaction, relay + projector idempotent (apply twice = same rows), `version` increments on insert/update/soft-delete and follows commit order under concurrent writers |
| `presentation/` (routers) | `tests/e2e/<module>/` | `httpx.AsyncClient` + ASGI app | Status codes & envelope per `07-api-contract.md`, 401/403/422/426/429 |
| Tenant isolation | `tests/integration/<module>/` + `tests/e2e/<module>/` | Postgres with RLS, connected as `poslite_app` | For every new table/endpoint: tenant A cannot read/write tenant B's rows; missing `app.tenant_id` → 0 rows; pull/push only see the device's tenant |
| Sync | `tests/e2e/sync/` + `tests/integration/sync/` | as above | Same batch pushed twice → no duplicates; per-event `accepted/duplicate/flagged/rejected`; previously `rejected` event re-pushed → reprocessed; totals recomputed with payload `rates` (`TOTAL_MISMATCH`, `RATES_OUTDATED`); one rejected event doesn't roll back the batch (savepoint); order before its shift; revoked device → 401; two concurrent pushes from one device (`asyncio.gather`) → no double insert |

### Shared fixtures

`tests/fixtures/pricing-cases.json` is the **source of truth** shared with `poslite-web` (a symlink to `poslite-web/tests/fixtures/pricing-cases.json` — one file, edit either path). `PriceCalculator` tests must be parametrized over it (`pytest.mark.parametrize` loaded from the JSON). Any change requires the matching change in `poslite-web`.

> ⚠️ Money math is **integer-only** (ADR-005): rates are basis points (`int`), percentage discounts are `int` 0..100, and the only rounding function is `shared.domain.money.div_round_half_up(n, d)` = `(2n + d) // (2d)`, mirroring `divRoundHalfUp` in `poslite-web`. Never use `float`, `Decimal`, or `round()` (banker's rounding: `round(2.5) == 2`) for money. Keep exact `.5` cases in the fixture.

### Example

```python
# RED — tests/unit/sales/test_price_calculator.py
def test_caps_fixed_discount_at_subtotal() -> None:
    result = PriceCalculator().calculate(
        lines=[PricedLine(unit_price=Money(5000), modifiers_total=Money(0), quantity=1)],
        discount=Discount.fixed(Money(10000)),
        rates=Rates(service_bps=0, tax_bps=0),
    )

    assert result.discount_amount == Money(5000)
    assert result.total == Money(0)
# run → FAIL (AssertionError: Money(10000) != Money(5000)), then minimal fix, then refactor
```

## 5. Architecture Rules

```
src/poslite/<module>/
  domain/          entities.py, value_objects.py, services.py, events.py, exceptions.py, repository.py (Protocol)
  application/     commands.py, <use_case>.py, queries.py
  infrastructure/  models.py (SQLAlchemy), repository.py, mappers.py
  presentation/    router.py, schemas.py (Pydantic request/response)
src/poslite/shared/   domain (Money, Ulid, DomainEvent), application (UnitOfWork, Clock), infrastructure, presentation
tests/unit | tests/integration | tests/e2e
```

- **`domain/` is pure Python**: no imports from `fastapi`, `pydantic`, `sqlalchemy`, `redis`, `arq`, or `infrastructure`. Use `@dataclass(frozen=True, slots=True)` for value objects.
- Dependencies point inward: `presentation → application → domain`; `infrastructure` implements `domain`/`application` Protocols.
- Routers are thin: parse Pydantic schema → build command → call use case (via `Depends`) → map to response schema. No business logic or SQL in routers.
- Pydantic schemas (API) ≠ domain entities. Never return SQLAlchemy models or domain entities directly.
- Modules talk via use-case interfaces or domain events — never import another module's `infrastructure` or query its tables.
- All boundaries are enforced by `import-linter` contracts in `pyproject.toml`; don't add ignores.
- Full DDD for **sales** and **shift**. **catalog/payment/organization** may be thin (models + service + router + schemas) but still test-first.
- **Use cases never commit** (ADR-010). They receive a `UnitOfWork` argument; the entrypoint owns the transaction: `PushEventsHandler` (one transaction per batch, savepoint per event), router dependency (one per request), arq job (one per job).
- Domain events go to the `outbox_messages` table inside the same transaction (ADR-012); the arq relay delivers them to projectors. Never enqueue to Redis directly from the request path as the only delivery mechanism.
- Everything on the request path is async. Never call blocking I/O (`requests`, `time.sleep`, sync DB driver) inside `async def`.

## 6. Non-Negotiable Domain Rules

- **Money is integer Rupiah** — `BIGINT` columns, `Money(int)` value object; never `float`. Rates are integer basis points. Rounding only via `div_round_half_up`.
- **Recompute order totals with the rates snapshot in the payload** (ADR-011), never with the outlet's current rates.
- **IDs are ULIDs.** Transactional IDs (orders, lines, payments, shifts, events) come **from the device** — validate, never regenerate.
- **Sync push is idempotent** by event id (`sync_events.id` PK, `INSERT … ON CONFLICT DO NOTHING`). Event effects + `sync_events` row in the same transaction; **savepoint per event**.
- Per-device push is serialized with `pg_advisory_xact_lock`.
- **Never reject a paid order because totals differ** — accept, recompute server-side, mark `flagged`.
- **Paid orders are immutable.** Voids are separate records; never UPDATE order amounts.
- Master tables carry `version BIGINT` + `deleted_at`; hard deletes of master data are forbidden. `version` is assigned **only** by the DB trigger `assign_sync_version()` (advisory lock + `sync_version_seq`, ADR-009) — the ORM never writes it. Changes to link tables (`product_modifier_group`, `outlet_user`, `outlet_payment_method`) must touch the parent row. Keep back-office transactions short.
- `business_date` derives from outlet `business_day_cutoff` + timezone (`zoneinfo`), not calendar date.
- **Multi-tenant (ADR-013)**: every tenant-owned table has `tenant_id NOT NULL` + an RLS policy (use the `enable_tenant_rls()` migration helper). The API connects as `poslite_app` (no `BYPASSRLS`); the UoW sets `app.tenant_id` per transaction. Never use the `poslite_system` role outside the outbox relay, token lookup, and `/platform/*`. Unique constraints start with `tenant_id`. No `tenant_id` in tenant API URLs/bodies — it comes from the token.
- Tokens are stored as SHA-256 hashes; passwords with argon2; PIN hashes are PBKDF2-SHA256 (WebCrypto-compatible). Never log PINs, tokens, passwords, or full payment references.

## 7. Code Style

- Type hints on every function; `mypy --strict` clean. No `Any` except at I/O boundaries (then narrow immediately). No `# type: ignore` without an error code and reason.
- `ruff` for lint + format (line length 100). Imports absolute from `poslite.`.
- `snake_case` functions/modules, `PascalCase` classes, `UPPER_CASE` constants. Use-case classes end with `Handler` or are named by verb (`PlaceOrderHandler`).
- No mutable default args; no `from x import *`; prefer `match` for event-type dispatch.
- Config only via `pydantic-settings` (`poslite.shared.config.Settings`); no `os.environ` elsewhere.
- Errors: raise domain exceptions (subclass `DomainError` with a machine `code`); map to HTTP in `shared/presentation/errors.py`. Response envelope per `07-api-contract.md`.
- Migrations: one Alembic revision per change, reviewed by hand; never edit a merged revision; no data loss without explicit approval.
- Avoid N+1: explicit `selectinload`/`joinedload`; integration test with query count for list endpoints.

## 8. Git

- Small commits, one behavior each; commit at green after refactor.
- Conventional Commits: `feat(sync): return duplicate status for replayed events`, `test(shift): …`, `fix(sales): …`, `refactor(…)`.
- Any change to request/response shape → update `docs/architecture/07-api-contract.md` + regenerate and commit `openapi.json` in the same PR.
- Never commit `.env` (only `.env.example`) or secrets.

## 9. Definition of Done

- [ ] Tests written first; RED observed; all green
- [ ] ruff, mypy --strict, import-linter, pytest (coverage ≥ 85%) pass
- [ ] Idempotent where the endpoint/job can be retried
- [ ] Money integer, IDs ULID, no business logic in routers or SQLAlchemy models
- [ ] New tables have `tenant_id` + RLS policy, with a tenant-isolation test
- [ ] Permissions checked for sensitive actions (void, discount override, shift close, cash movement)
- [ ] Docs/ADR/`openapi.json` updated if contract or decision changed
- [ ] Summary to user (in Bahasa Indonesia): what changed, tests added, anything not done

## 10. When to Stop and Ask

- Requirement is ambiguous or contradicts `docs/architecture/*`
- A new dependency is needed (state why)
- Sync payload / API contract change (must be coordinated with `poslite-web`)
- A migration would alter or drop existing data
- A new table seems not to need `tenant_id`/RLS, or a feature seems to need cross-tenant access
- A test you did not write seems wrong
- You would need to relax mypy/ruff/import-linter rules or skip a test
