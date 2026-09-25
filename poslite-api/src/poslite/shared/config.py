from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration. The only place that reads environment variables."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ADR-013: app role (RLS enforced), owner role (migrations), system role (BYPASSRLS; token
    # lookup and outbox relay only).
    database_url: str = "postgresql+asyncpg://poslite_app:poslite@localhost:5432/poslite"
    migration_database_url: str = "postgresql+asyncpg://poslite:poslite@localhost:5432/poslite"
    system_database_url: str = "postgresql+asyncpg://poslite_system:poslite@localhost:5432/poslite"
    redis_url: str = "redis://localhost:6379/0"
    min_app_version: str = "0.0.0"
    cors_origins: list[str] = []


@lru_cache
def get_settings() -> Settings:
    return Settings()
