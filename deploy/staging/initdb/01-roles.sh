#!/bin/bash
# Runs once, on the first start of an empty data volume. Same roles as `make db-setup` (ADR-013):
# poslite owns the tables (migrations), poslite_app is subject to row-level security,
# poslite_system bypasses it for token lookup and the outbox relay only.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username postgres \
	-v owner_pw="$OWNER_DB_PASSWORD" -v app_pw="$APP_DB_PASSWORD" -v system_pw="$SYSTEM_DB_PASSWORD" <<'SQL'
CREATE ROLE poslite LOGIN PASSWORD :'owner_pw';
CREATE ROLE poslite_app LOGIN PASSWORD :'app_pw' NOBYPASSRLS;
CREATE ROLE poslite_system LOGIN PASSWORD :'system_pw' BYPASSRLS;
CREATE DATABASE poslite OWNER poslite;
SQL
