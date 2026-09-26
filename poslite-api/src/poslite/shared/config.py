from functools import lru_cache
from typing import Literal

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
    # ADR-017/018: payment gateway adapter and subscription price (integer Rupiah per outlet/month).
    payment_gateway: Literal["fake"] = "fake"
    gateway_secret: str = "dev-gateway-secret"  # noqa: S105 — dev default; set per environment
    public_api_url: str = "http://localhost:8000"
    price_per_outlet: int = 150_000


@lru_cache
def get_settings() -> Settings:
    return Settings()
