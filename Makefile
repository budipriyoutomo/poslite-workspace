# POSLite monorepo — the only Makefile. Local development without Docker (local PostgreSQL).
.DEFAULT_GOAL := help
SHELL := /bin/bash

API_DIR ?= poslite-api
WEB_DIR ?= poslite-web
ADMIN_DIR ?= poslite-admin
OPERATOR_DIR ?= poslite-operator
BRIDGE_DIR ?= poslite-print-bridge
DOCS_DIR ?= poslite-docs

API_PORT ?= 8000
WEB_PORT ?= 3000
DB_HOST ?= localhost
DB_USER ?= poslite
DB_PASSWORD ?= poslite
DB_NAME ?= poslite
DB_TEST_NAME ?= poslite_test
DB_E2E_NAME ?= poslite_e2e
# Admin connection as the current OS user (Homebrew Postgres default superuser).
PSQL_ADMIN ?= psql -h $(DB_HOST) -d postgres -v ON_ERROR_STOP=1 -q

UV := uv --directory $(API_DIR)
PNPM := pnpm --dir $(WEB_DIR)
ADMIN := pnpm --dir $(ADMIN_DIR)
OPERATOR := pnpm --dir $(OPERATOR_DIR)
BRIDGE := pnpm --dir $(BRIDGE_DIR)

.PHONY: help doctor setup install dev check test fmt dev-admin admin-install admin-test admin-check admin-types admin-e2e \
	dev-operator operator-install operator-test operator-check operator-types operator-e2e \
	dev-bridge bridge-install bridge-test bridge-check \
	dev-api worker openapi report-rebuild billing-run platform-admin api-install api-test api-check api-fmt env db-setup db-drop db-reset migrate migrate-down migration \
	dev-web web-install web-test web-check web-build web-e2e e2e-fullstack web-spike-dexie repos-remotes repos-push

help: ## Show available targets
	@awk 'BEGIN { FS = ":.*## " } \
		/^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } \
		/^[a-z0-9-]+:.*## / { printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

##@ Workspace (API + web + admin + operator)

doctor: ## Check tools, app folders and local PostgreSQL
	@ok=1; \
	for tool in uv pnpm psql; do \
		command -v $$tool >/dev/null && echo "✓ $$tool" || { echo "✗ $$tool not found in PATH"; ok=0; }; \
	done; \
	for dir in $(API_DIR) $(WEB_DIR) $(ADMIN_DIR) $(OPERATOR_DIR) $(DOCS_DIR); do \
		test -d $$dir && echo "✓ $$dir" || { echo "✗ $$dir missing"; ok=0; }; \
	done; \
	pg_isready -h $(DB_HOST) -q && echo "✓ PostgreSQL on $(DB_HOST):5432" || { echo "✗ PostgreSQL not reachable (brew services start postgresql)"; ok=0; }; \
	redis-cli ping >/dev/null 2>&1 && echo "✓ Redis (make worker)" || echo "! Redis not reachable — only 'make worker' (report projections) needs it: brew install redis && brew services start redis"; \
	[ $$ok = 1 ]

setup: doctor install env db-setup migrate ## First-time setup: deps, .env, local DBs, migrations

install: api-install web-install admin-install operator-install bridge-install ## Install deps for API, POS web, back-office, operator console and print bridge

dev: ## Run API (:8000), POS web (:3000), back-office (:3001) and operator console (:3002) — Ctrl-C stops all
	@trap 'kill 0' INT TERM; \
	$(MAKE) --no-print-directory dev-api 2>&1 | awk '{ print "\033[35m[api]\033[0m " $$0; fflush() }' & \
	$(MAKE) --no-print-directory dev-web 2>&1 | awk '{ print "\033[36m[web]\033[0m " $$0; fflush() }' & \
	$(MAKE) --no-print-directory dev-admin 2>&1 | awk '{ print "\033[33m[admin]\033[0m " $$0; fflush() }' & \
	$(MAKE) --no-print-directory dev-operator 2>&1 | awk '{ print "\033[32m[operator]\033[0m " $$0; fflush() }' & \
	wait

check: api-check web-check admin-check operator-check bridge-check ## Everything required before a commit (all apps)

test: api-test web-test admin-test operator-test bridge-test ## Run tests for all apps

fmt: api-fmt ## Auto-fix lint and format

##@ API (poslite-api)

dev-api: ## Run only the API with auto-reload (API_PORT, default 8000)
	PYTHONUNBUFFERED=1 $(UV) run uvicorn poslite.main:app --reload --port $(API_PORT)

worker: ## Run the arq worker: outbox relay, webhooks, daily billing (needs a local Redis)
	$(UV) run arq poslite.worker.WorkerSettings

openapi: ## Regenerate poslite-api/openapi.json (the contract clients generate types from)
	$(UV) run python -m poslite.tools.export_openapi

report-rebuild: ## Recompute report tables from orders: make report-rebuild from=2026-09-01 to=2026-09-30
	@test -n "$(from)" -a -n "$(to)" || { echo 'usage: make report-rebuild from=YYYY-MM-DD to=YYYY-MM-DD'; exit 1; }
	$(UV) run python -m poslite.reporting rebuild --from $(from) --to $(to)

billing-run: ## Run the subscription job once: trials, invoices, suspensions (the worker runs it daily)
	$(UV) run python -m poslite.billing run

platform-admin: ## Create a SaaS operator account: make platform-admin email=ops@x.id name=Ops
	@test -n "$(email)" -a -n "$(name)" || { echo 'usage: make platform-admin email=… name=…'; exit 1; }
	$(UV) run python -m poslite.platform_admin create-admin "$(email)" "$(name)"

api-install: ## Install Python deps (uv)
	$(UV) sync

api-test: ## Run API tests
	$(UV) run pytest

api-check: ## ruff, format check, mypy, import-linter, pytest + coverage
	$(UV) run ruff check .
	$(UV) run ruff format --check .
	$(UV) run mypy src
	$(UV) run lint-imports
	$(UV) run pytest --cov --cov-fail-under=85

api-fmt: ## Auto-fix Python lint and format
	$(UV) run ruff check . --fix
	$(UV) run ruff format .

##@ Database

env: ## Create poslite-api/.env from .env.example if missing
	@test -f $(API_DIR)/.env || (cp $(API_DIR)/.env.example $(API_DIR)/.env && echo "created $(API_DIR)/.env")

db-setup: ## Create local roles (owner, app, system) + dev/test databases (idempotent)
	@$(PSQL_ADMIN) -tAc "SELECT 1 FROM pg_roles WHERE rolname = '$(DB_USER)'" | grep -q 1 \
		|| $(PSQL_ADMIN) -c "CREATE ROLE $(DB_USER) LOGIN PASSWORD '$(DB_PASSWORD)' CREATEDB"
	@# ADR-013: the API runs as $(DB_USER)_app (row-level security applies); $(DB_USER)_system bypasses
	@# RLS for token lookup and the outbox relay only. Tables are owned by $(DB_USER) (migrations).
	@$(PSQL_ADMIN) -tAc "SELECT 1 FROM pg_roles WHERE rolname = '$(DB_USER)_app'" | grep -q 1 \
		|| $(PSQL_ADMIN) -c "CREATE ROLE $(DB_USER)_app LOGIN PASSWORD '$(DB_PASSWORD)' NOBYPASSRLS"
	@$(PSQL_ADMIN) -tAc "SELECT 1 FROM pg_roles WHERE rolname = '$(DB_USER)_system'" | grep -q 1 \
		|| $(PSQL_ADMIN) -c "CREATE ROLE $(DB_USER)_system LOGIN PASSWORD '$(DB_PASSWORD)' BYPASSRLS"
	@for db in $(DB_NAME) $(DB_TEST_NAME); do \
		$(PSQL_ADMIN) -tAc "SELECT 1 FROM pg_database WHERE datname = '$$db'" | grep -q 1 \
			|| $(PSQL_ADMIN) -c "CREATE DATABASE $$db OWNER $(DB_USER)"; \
	done
	@echo "databases ready: $(DB_NAME), $(DB_TEST_NAME) (roles $(DB_USER), $(DB_USER)_app, $(DB_USER)_system)"

db-drop: ## Drop local dev/test databases (asks first)
	@read -p "Drop $(DB_NAME) and $(DB_TEST_NAME)? [y/N] " ok && [ "$$ok" = y ]
	$(PSQL_ADMIN) -c "DROP DATABASE IF EXISTS $(DB_NAME)" -c "DROP DATABASE IF EXISTS $(DB_TEST_NAME)"

db-reset: db-drop db-setup migrate ## Drop, recreate and migrate local databases (asks first)

migrate: ## Apply Alembic migrations (upgrade head)
	$(UV) run alembic upgrade head

migrate-down: ## Roll back the last Alembic migration
	$(UV) run alembic downgrade -1

migration: ## New autogenerated migration: make migration m="add orders" (then REVIEW the file)
	@test -n "$(m)" || { echo 'usage: make migration m="describe change"'; exit 1; }
	$(UV) run alembic revision --autogenerate -m "$(m)"

##@ Web (poslite-web)

dev-web: ## Run only the Next.js dev server (WEB_PORT, default 3000)
	$(PNPM) dev --port $(WEB_PORT)

web-install: ## Install JS deps (pnpm)
	$(PNPM) install

web-test: ## Run unit/component/architecture tests
	$(PNPM) test

web-check: ## typecheck, lint, tests
	$(PNPM) typecheck
	$(PNPM) lint
	$(PNPM) test

web-build: ## Production build
	$(PNPM) build

web-e2e: ## Playwright e2e (once: playwright install chromium; macOS 13: make web-e2e PW_CHANNEL=chrome)
	PW_CHANNEL=$(PW_CHANNEL) $(PNPM) e2e

e2e-fullstack: ## Browser + real API: activate, sell offline, sync (fresh poslite_e2e DB; needs uv + pnpm)
	$(PSQL_ADMIN) -c "DROP DATABASE IF EXISTS $(DB_E2E_NAME) WITH (FORCE)" -c "CREATE DATABASE $(DB_E2E_NAME) OWNER $(DB_USER)"
	PW_CHANNEL=$(PW_CHANNEL) $(PNPM) exec playwright test --config playwright.fullstack.config.ts

web-spike-dexie: ## Fase 0 spike: Dexie with 5,000 orders in real Chrome at 1x and 4x CPU
	PW_CHANNEL=$(PW_CHANNEL) $(PNPM) exec playwright test --config tests/spikes/playwright.config.ts

##@ Back-office (poslite-admin)

dev-admin: ## Run only the back-office dev server (:3001)
	$(ADMIN) dev

admin-install: ## Install back-office deps (pnpm)
	$(ADMIN) install

admin-test: ## Back-office unit/component tests
	$(ADMIN) test

admin-check: ## Back-office typecheck, lint, tests
	$(ADMIN) typecheck
	$(ADMIN) lint
	$(ADMIN) test

admin-e2e: ## Back-office e2e vs the real API (fresh poslite_e2e_admin DB; macOS 13: PW_CHANNEL=chrome)
	$(PSQL_ADMIN) -c "DROP DATABASE IF EXISTS $(DB_E2E_NAME)_admin WITH (FORCE)" -c "CREATE DATABASE $(DB_E2E_NAME)_admin OWNER $(DB_USER)"
	PW_CHANNEL=$(PW_CHANNEL) $(ADMIN) e2e

admin-types: openapi ## Regenerate the back-office API types from poslite-api/openapi.json
	$(ADMIN) api:types

##@ Operator console (poslite-operator)

dev-operator: ## Run only the SaaS operator console dev server (:3002)
	$(OPERATOR) dev

operator-install: ## Install operator console deps (pnpm)
	$(OPERATOR) install

operator-test: ## Operator console unit/component tests
	$(OPERATOR) test

operator-check: ## Operator console typecheck, lint, tests
	$(OPERATOR) typecheck
	$(OPERATOR) lint
	$(OPERATOR) test

operator-e2e: ## Operator console e2e vs the real API (fresh poslite_e2e_operator DB; macOS 13: PW_CHANNEL=chrome)
	$(PSQL_ADMIN) -c "DROP DATABASE IF EXISTS $(DB_E2E_NAME)_operator WITH (FORCE)" -c "CREATE DATABASE $(DB_E2E_NAME)_operator OWNER $(DB_USER)"
	PW_CHANNEL=$(PW_CHANNEL) $(OPERATOR) e2e

operator-types: openapi ## Regenerate the operator console API types from poslite-api/openapi.json
	$(OPERATOR) api:types

##@ Print Bridge (poslite-print-bridge)

dev-bridge: ## Run the LAN Print Bridge on :9180 (needs BRIDGE_TOKEN; see poslite-print-bridge/README.md)
	$(BRIDGE) start

bridge-install: ## Install print bridge dev deps (pnpm; the bridge itself has no runtime deps)
	$(BRIDGE) install

bridge-test: ## Print bridge tests (node --test)
	$(BRIDGE) test

bridge-check: ## Print bridge typecheck + tests
	$(BRIDGE) typecheck
	$(BRIDGE) test

##@ Publishing (one GitHub repo per app)

# The monorepo stays the source of truth; each app folder (with its history) is mirrored to its own
# repo with `git subtree split`. poslite-docs, deploy/ and this Makefile live only in the monorepo.
GITHUB_OWNER ?= budipriyoutomo
APPS ?= poslite-api poslite-web poslite-admin poslite-operator

repos-remotes: ## Add a git remote per app repo on GitHub (GITHUB_OWNER), once
	@for app in $(APPS); do \
		git remote get-url $$app >/dev/null 2>&1 || git remote add $$app https://github.com/$(GITHUB_OWNER)/$$app.git; \
		echo "✓ $$app → $$(git remote get-url $$app)"; \
	done

repos-push: repos-remotes ## Mirror each app folder's committed history to its own repo (main); commit first
	@test -z "$$(git status --porcelain -- $(APPS))" || { echo "✗ Uncommitted changes in an app folder; commit first"; exit 1; }
	@for app in $(APPS); do \
		echo "→ $$app"; \
		git subtree split -q --prefix=$$app -b split/$$app && git push $$app split/$$app:main || exit 1; \
	done
