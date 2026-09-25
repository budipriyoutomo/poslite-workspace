# poslite-api

Backend POSLite (Python · FastAPI · PostgreSQL). Tujuan sinkronisasi untuk POS PWA offline-first dan API back-office multi-tenant.

- Arsitektur: [`docs/architecture/`](docs/architecture/README.md) (git submodule `poslite-docs`)
- Aturan kerja untuk AI agent & developer: [`AGENTS.md`](AGENTS.md)

## Mulai

```bash
git submodule update --init
uv sync
docker compose up -d postgres redis
cp .env.example .env
uv run alembic upgrade head
uv run uvicorn poslite.main:app --reload
```

## Cek sebelum commit

```bash
uv run ruff check . && uv run ruff format --check . && uv run mypy src && uv run lint-imports && uv run pytest
```
