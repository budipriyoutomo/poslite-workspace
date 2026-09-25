# Local development without Docker: uses the PostgreSQL server installed on this machine.
.DEFAULT_GOAL := help
SHELL := /bin/bash

API_PORT ?= 8000
DB_HOST ?= localhost
DB_USER ?= poslite
DB_PASSWORD ?= poslite
DB_NAME ?= poslite
DB_TEST_NAME ?= poslite_test
# Admin connection as the current OS user (Homebrew Postgres default superuser).
PSQL_ADMIN ?= psql -h $(DB_HOST) -d postgres -v ON_ERROR_STOP=1 -q

.PHONY: help install env db-setup db-drop migrate dev test check fmt

help: ## Show available targets
	@grep -hE '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

install: ## Install Python deps (uv)
	uv sync

env: ## Create .env from .env.example if missing
	@test -f .env || (cp .env.example .env && echo "created .env")

db-setup: ## Create local role + dev/test databases (idempotent)
	@$(PSQL_ADMIN) -tAc "SELECT 1 FROM pg_roles WHERE rolname = '$(DB_USER)'" | grep -q 1 \
		|| $(PSQL_ADMIN) -c "CREATE ROLE $(DB_USER) LOGIN PASSWORD '$(DB_PASSWORD)' CREATEDB"
	@for db in $(DB_NAME) $(DB_TEST_NAME); do \
		$(PSQL_ADMIN) -tAc "SELECT 1 FROM pg_database WHERE datname = '$$db'" | grep -q 1 \
			|| $(PSQL_ADMIN) -c "CREATE DATABASE $$db OWNER $(DB_USER)"; \
	done
	@echo "databases ready: $(DB_NAME), $(DB_TEST_NAME) (role $(DB_USER))"

db-drop: ## Drop local dev/test databases (asks first)
	@read -p "Drop $(DB_NAME) and $(DB_TEST_NAME)? [y/N] " ok && [ "$$ok" = y ]
	$(PSQL_ADMIN) -c "DROP DATABASE IF EXISTS $(DB_NAME)" -c "DROP DATABASE IF EXISTS $(DB_TEST_NAME)"

migrate: ## Apply Alembic migrations
	uv run alembic upgrade head

dev: ## Run API with auto-reload (API_PORT, default 8000)
	PYTHONUNBUFFERED=1 uv run uvicorn poslite.main:app --reload --port $(API_PORT)

test: ## Run tests
	uv run pytest

check: ## Everything required before a commit (AGENTS.md §3)
	uv run ruff check .
	uv run ruff format --check .
	uv run mypy src
	uv run lint-imports
	uv run pytest --cov --cov-fail-under=85

fmt: ## Auto-fix lint and format
	uv run ruff check . --fix
	uv run ruff format .
