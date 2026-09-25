import pytest

from poslite.shared.config import Settings, get_settings


def test_reads_database_url_from_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@db:5432/x")

    assert Settings(_env_file=None).database_url == "postgresql+asyncpg://u:p@db:5432/x"


def test_get_settings_is_cached() -> None:
    assert get_settings() is get_settings()
