# POSLite monorepo: runs frontend + backend together for local development (no Docker).
.DEFAULT_GOAL := help
SHELL := /bin/bash

API_DIR ?= poslite-api
WEB_DIR ?= poslite-web
DOCS_DIR ?= poslite-docs
SUBMAKE := $(MAKE) --no-print-directory

.PHONY: help doctor setup install dev dev-api dev-web check test

help: ## Show available targets
	@grep -hE '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[36m%-8s\033[0m %s\n", $$1, $$2}'

doctor: ## Check tools, app folders and local PostgreSQL
	@ok=1; \
	for tool in uv pnpm psql; do \
		command -v $$tool >/dev/null && echo "✓ $$tool" || { echo "✗ $$tool not found in PATH"; ok=0; }; \
	done; \
	for dir in $(API_DIR) $(WEB_DIR) $(DOCS_DIR); do \
		test -d $$dir && echo "✓ $$dir" || { echo "✗ $$dir missing"; ok=0; }; \
	done; \
	pg_isready -h localhost -q && echo "✓ PostgreSQL on localhost:5432" || { echo "✗ PostgreSQL not reachable (brew services start postgresql)"; ok=0; }; \
	[ $$ok = 1 ]

setup: doctor ## First-time setup: deps, .env, local DBs, migrations
	@$(SUBMAKE) -C $(API_DIR) install env db-setup migrate
	@$(SUBMAKE) -C $(WEB_DIR) install

install: ## Install deps for API and web
	@$(SUBMAKE) -C $(API_DIR) install
	@$(SUBMAKE) -C $(WEB_DIR) install

dev: ## Run API (:8000) and web (:3000) together — Ctrl-C stops both
	@trap 'kill 0' INT TERM; \
	$(SUBMAKE) dev-api 2>&1 | awk '{ print "\033[35m[api]\033[0m " $$0; fflush() }' & \
	$(SUBMAKE) dev-web 2>&1 | awk '{ print "\033[36m[web]\033[0m " $$0; fflush() }' & \
	wait

dev-api: ## Run only the API
	@$(SUBMAKE) -C $(API_DIR) dev

dev-web: ## Run only the web app
	@$(SUBMAKE) -C $(WEB_DIR) dev

check: ## Run pre-commit checks for API and web
	@$(SUBMAKE) -C $(API_DIR) check
	@$(SUBMAKE) -C $(WEB_DIR) check

test: ## Run tests for API and web
	@$(SUBMAKE) -C $(API_DIR) test
	@$(SUBMAKE) -C $(WEB_DIR) test

