import pytest

from poslite.shared.config import Settings, get_settings


def test_reads_database_url_from_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@db:5432/x")

    assert Settings(_env_file=None).database_url == "postgresql+asyncpg://u:p@db:5432/x"


def test_get_settings_is_cached() -> None:
    assert get_settings() is get_settings()


def test_reads_migration_and_system_database_urls(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MIGRATION_DATABASE_URL", "postgresql+asyncpg://owner:p@db:5432/x")
    monkeypatch.setenv("SYSTEM_DATABASE_URL", "postgresql+asyncpg://system:p@db:5432/x")

    settings = Settings(_env_file=None)

    assert settings.migration_database_url == "postgresql+asyncpg://owner:p@db:5432/x"
    assert settings.system_database_url == "postgresql+asyncpg://system:p@db:5432/x"
