# POSLite monorepo — the only Makefile. Local development without Docker (local PostgreSQL).
.DEFAULT_GOAL := help
SHELL := /bin/bash

API_DIR ?= poslite-api
WEB_DIR ?= poslite-web
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

.PHONY: help doctor setup install dev check test fmt \
	dev-api worker platform-admin api-install api-test api-check api-fmt env db-setup db-drop db-reset migrate migrate-down migration \
	dev-web web-install web-test web-check web-build web-e2e e2e-fullstack web-spike-dexie

help: ## Show available targets
	@awk 'BEGIN { FS = ":.*## " } \
		/^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } \
		/^[a-z0-9-]+:.*## / { printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

##@ Workspace (API + web)

doctor: ## Check tools, app folders and local PostgreSQL
	@ok=1; \
	for tool in uv pnpm psql; do \
		command -v $$tool >/dev/null && echo "✓ $$tool" || { echo "✗ $$tool not found in PATH"; ok=0; }; \
	done; \
	for dir in $(API_DIR) $(WEB_DIR) $(DOCS_DIR); do \
		test -d $$dir && echo "✓ $$dir" || { echo "✗ $$dir missing"; ok=0; }; \
	done; \
	pg_isready -h $(DB_HOST) -q && echo "✓ PostgreSQL on $(DB_HOST):5432" || { echo "✗ PostgreSQL not reachable (brew services start postgresql)"; ok=0; }; \
	[ $$ok = 1 ]

setup: doctor install env db-setup migrate ## First-time setup: deps, .env, local DBs, migrations

install: api-install web-install ## Install deps for API and web

dev: ## Run API (:8000) and web (:3000) together — Ctrl-C stops both
	@trap 'kill 0' INT TERM; \
	$(MAKE) --no-print-directory dev-api 2>&1 | awk '{ print "\033[35m[api]\033[0m " $$0; fflush() }' & \
	$(MAKE) --no-print-directory dev-web 2>&1 | awk '{ print "\033[36m[web]\033[0m " $$0; fflush() }' & \
	wait

check: api-check web-check ## Everything required before a commit (API + web)

test: api-test web-test ## Run tests for API and web

fmt: api-fmt ## Auto-fix lint and format

##@ API (poslite-api)

dev-api: ## Run only the API with auto-reload (API_PORT, default 8000)
	PYTHONUNBUFFERED=1 $(UV) run uvicorn poslite.main:app --reload --port $(API_PORT)

worker: ## Run the arq worker: outbox relay → report projections (needs a local Redis)
	$(UV) run arq poslite.worker.WorkerSettings

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
