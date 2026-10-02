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
    # ADR-021: product images. The database keeps object keys; URLs = media_base_url + "/" + key,
    # so switching S3 vendors is a copy of the objects plus these settings (no data migration).
    media_storage: Literal["local", "s3"] = "local"
    media_local_dir: str = "var/media"  # local only: served by the API at /media
    media_public_base_url: str = ""  # empty = {public_api_url}/media (local storage)
    s3_endpoint_url: str = ""  # IDCloudHost: https://is3.cloudhost.id
    s3_region: str = ""  # IDCloudHost: SouthJkt-a
    s3_bucket: str = ""
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_object_acl: str = "public-read"  # empty = rely on the bucket policy

    @property
    def media_base_url(self) -> str:
        return (self.media_public_base_url or f"{self.public_api_url}/media").rstrip("/")


@lru_cache
def get_settings() -> Settings:
    return Settings()
