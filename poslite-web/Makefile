.DEFAULT_GOAL := help
SHELL := /bin/bash

WEB_PORT ?= 3000

.PHONY: help install dev test check build e2e

help: ## Show available targets
	@grep -hE '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

install: ## Install JS deps (pnpm)
	pnpm install

dev: ## Run Next.js dev server (WEB_PORT, default 3000)
	pnpm dev --port $(WEB_PORT)

test: ## Run unit/component/architecture tests
	pnpm test

check: ## Everything required before a commit (AGENTS.md §3)
	pnpm typecheck
	pnpm lint
	pnpm test

build: ## Production build
	pnpm build

e2e: ## Playwright end-to-end tests (needs `pnpm exec playwright install chromium` once)
	pnpm e2e
