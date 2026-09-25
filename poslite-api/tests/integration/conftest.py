"""Integration tests against the local PostgreSQL test database (poslite_test).

The schema is rebuilt once per session with the real Alembic migrations (as the owner role).
Tests use the app role (RLS enforced) and the system role exactly like production, commit for
real, and every table is truncated after each test.
"""

import asyncio
from collections.abc import AsyncIterator
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

API_ROOT = Path(__file__).resolve().parents[2]


class TestDatabaseSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=API_ROOT / ".env", env_prefix="TEST_", extra="ignore"
    )

    database_url: str
    migration_database_url: str
    system_database_url: str


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    for item in items:
        if "tests/integration" in str(item.path):
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
async def app_engine(
    migrated: None, db_settings: TestDatabaseSettings
) -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(db_settings.database_url)
    yield engine
    await engine.dispose()


@pytest.fixture(scope="session")
async def system_engine(
    migrated: None, db_settings: TestDatabaseSettings
) -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(db_settings.system_database_url)
    yield engine
    await engine.dispose()


@pytest.fixture(scope="session")
async def owner_engine(
    migrated: None, db_settings: TestDatabaseSettings
) -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(db_settings.migration_database_url)
    yield engine
    await engine.dispose()


@pytest.fixture(autouse=True)
async def _truncate_after_test(owner_engine: AsyncEngine) -> AsyncIterator[None]:
    yield
    async with owner_engine.begin() as conn:
        tables = (
            await conn.execute(
                text(
                    "SELECT tablename FROM pg_tables"
                    " WHERE schemaname = 'public' AND tablename <> 'alembic_version'"
                )
            )
        ).scalars()
        names = ", ".join(f'"{t}"' for t in tables)
        if names:
            # Table names come from pg_tables, not from input.
            await conn.execute(text(f"TRUNCATE {names} RESTART IDENTITY CASCADE"))
