# POSLite API image: one image for the API (gunicorn + uvicorn workers), the arq worker and the
# one-shot migration job — the command picks the role (see deploy/staging/compose.yaml).
FROM python:3.12-slim AS build

COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app

# Dependencies first so code changes reuse this layer.
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY src ./src
COPY README.md ./
RUN uv sync --locked --no-dev


FROM python:3.12-slim

RUN useradd --system --uid 10001 --home /app poslite
WORKDIR /app
COPY --from=build --chown=poslite /app/.venv ./.venv
COPY --chown=poslite src ./src
COPY --chown=poslite migrations ./migrations
COPY --chown=poslite alembic.ini ./
RUN mkdir -p var/media && chown poslite var/media

ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1
USER poslite
EXPOSE 8000

# Behind Caddy: the port is reachable only on the compose network, so X-Forwarded-* is trusted.
CMD ["gunicorn", "poslite.main:app", "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--bind", "0.0.0.0:8000", "--workers", "2", "--forwarded-allow-ips", "*", \
     "--access-logfile", "-", "--graceful-timeout", "30"]
