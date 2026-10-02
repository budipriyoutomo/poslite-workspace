from typing import Any

from poslite.shared.config import Settings
from poslite.shared.infrastructure.object_storage import LocalStorage, S3Storage, build_storage


class FakeS3Client:
    """Records put_object calls like boto3's S3 client (no network)."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def put_object(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        return {}


async def test_s3_puts_a_public_object_with_its_content_type() -> None:
    client = FakeS3Client()
    storage = S3Storage(client, bucket="poslite", acl="public-read")

    await storage.put("T1/products/P1.jpg", b"jpeg-bytes", "image/jpeg")

    assert client.calls == [
        {
            "Bucket": "poslite",
            "Key": "T1/products/P1.jpg",
            "Body": b"jpeg-bytes",
            "ContentType": "image/jpeg",
            "ACL": "public-read",
            "CacheControl": "public, max-age=31536000, immutable",
        }
    ]


async def test_s3_leaves_the_acl_to_the_bucket_policy_when_none_is_set() -> None:
    client = FakeS3Client()

    await S3Storage(client, bucket="poslite", acl="").put("k.png", b"x", "image/png")

    assert "ACL" not in client.calls[0]


def test_local_storage_is_the_default_and_is_served_by_the_api() -> None:
    settings = Settings(_env_file=None, public_api_url="http://localhost:8000")

    assert isinstance(build_storage(settings), LocalStorage)
    assert settings.media_base_url == "http://localhost:8000/media"


def test_s3_storage_uses_the_configured_public_base_url() -> None:
    settings = Settings(
        _env_file=None,
        media_storage="s3",
        s3_endpoint_url="https://is3.cloudhost.id",
        s3_region="SouthJkt-a",
        s3_bucket="poslite",
        s3_access_key_id="AK",
        s3_secret_access_key="SK",  # noqa: S106
        media_public_base_url="https://is3.cloudhost.id/poslite",
    )

    assert isinstance(build_storage(settings), S3Storage)
    assert settings.media_base_url == "https://is3.cloudhost.id/poslite"
