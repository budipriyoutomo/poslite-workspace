"""Database fixtures for integration and HTTP tests (local PostgreSQL test database poslite_test).

The schema is rebuilt once per session with the real Alembic migrations (as the owner role).
Tests use the app role (RLS enforced) and the system role exactly like production, commit for
real, and every table is truncated after each test that touched the database.
"""

import asyncio
from collections.abc import AsyncIterator
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from poslite.main import create_app
from poslite.shared.config import Settings

API_ROOT = Path(__file__).resolve().parents[1]


class TestDatabaseSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=API_ROOT / ".env", env_prefix="TEST_", extra="ignore"
    )

    database_url: str
    migration_database_url: str
    system_database_url: str


DB_FIXTURES = {"app_engine", "system_engine", "owner_engine", "api", "_clean_db"}


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    for item in items:
        if DB_FIXTURES & set(getattr(item, "fixturenames", ())):
            item.add_marker(pytest.mark.integration)


@pytest.fixture(scope="session")
def db_settings() -> TestDatabaseSettings:
    return TestDatabaseSettings()


@pytest.fixture(scope="session")
def migrated(db_settings: TestDatabaseSettings) -> None:
    """Fresh schema, then every migration. Sync fixture: Alembic's env.py calls asyncio.run."""

    async def reset_schema() -> None:
        engine = create_async_engine(db_settings.migration_database_url)
        async with engine.begin() as conn:
            await conn.execute(text("DROP SCHEMA public CASCADE"))
            await conn.execute(text("CREATE SCHEMA public"))
        await engine.dispose()

    def migrate() -> None:
        asyncio.run(reset_schema())
        config = Config(str(API_ROOT / "alembic.ini"))
        config.set_main_option("script_location", str(API_ROOT / "migrations"))
        config.set_main_option("sqlalchemy.url", db_settings.migration_database_url)
        command.upgrade(config, "head")

    # pytest-asyncio's loop is already running here; Alembic needs its own (asyncio.run).
    with ThreadPoolExecutor(max_workers=1) as pool:
        pool.submit(migrate).result()


@pytest.fixture(scope="session")
async def owner_engine(
    migrated: None, db_settings: TestDatabaseSettings
) -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(db_settings.migration_database_url)
    yield engine
    await engine.dispose()


@pytest.fixture(scope="session")
async def _app_engine(
    migrated: None, db_settings: TestDatabaseSettings
) -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(db_settings.database_url)
    yield engine
    await engine.dispose()


@pytest.fixture(scope="session")
async def _system_engine(
    migrated: None, db_settings: TestDatabaseSettings
) -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(db_settings.system_database_url)
    yield engine
    await engine.dispose()


@pytest.fixture
async def _clean_db(owner_engine: AsyncEngine) -> AsyncIterator[None]:
    """Truncate every tenant/data table after the test (lookup tables seeded by migrations stay)."""
    yield
    async with owner_engine.begin() as conn:
        tables = (
            await conn.execute(
                text(
                    "SELECT tablename FROM pg_tables"
                    " WHERE schemaname = 'public' AND tablename <> 'alembic_version'"
                    " AND tablename NOT IN ('roles', 'permissions', 'role_permissions')"
                )
            )
        ).scalars()
        names = ", ".join(f'"{t}"' for t in tables)
        if names:
            # Table names come from pg_tables, not from input.
            await conn.execute(text(f"TRUNCATE {names} RESTART IDENTITY CASCADE"))


@pytest.fixture
def app_engine(_app_engine: AsyncEngine, _clean_db: None) -> AsyncEngine:
    """App role (RLS enforced), like the API in production."""
    return _app_engine


@pytest.fixture
def system_engine(_system_engine: AsyncEngine, _clean_db: None) -> AsyncEngine:
    """System role (BYPASSRLS): token lookup and outbox relay only."""
    return _system_engine


@pytest.fixture
async def api(
    app_engine: AsyncEngine, db_settings: TestDatabaseSettings, tmp_path: Path
) -> AsyncIterator[AsyncClient]:
    """HTTP client for the real app wired to the test database (media in a temp folder)."""
    settings = Settings(
        _env_file=None,
        database_url=db_settings.database_url,
        system_database_url=db_settings.system_database_url,
        migration_database_url=db_settings.migration_database_url,
        media_local_dir=str(tmp_path / "media"),
    )
    app = create_app(settings)
    async with (
        app.router.lifespan_context(app),
        AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client,
    ):
        yield client
