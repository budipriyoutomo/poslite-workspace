"""ObjectStorage adapters (ADR-021): any S3-compatible vendor, or a local folder for dev/test."""

import asyncio
from pathlib import Path
from typing import TYPE_CHECKING, Any

import boto3
from botocore.config import Config

from poslite.shared.application.object_storage import ObjectStorage
from poslite.shared.config import Settings

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client
else:
    S3Client = Any

# Keys are never reused (a new upload gets a new ULID), so objects can be cached forever.
CACHE_CONTROL = "public, max-age=31536000, immutable"


class S3Storage:
    def __init__(self, client: S3Client, *, bucket: str, acl: str) -> None:
        self._client, self._bucket, self._acl = client, bucket, acl

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        extra: dict[str, Any] = {"ACL": self._acl} if self._acl else {}
        # boto3 is blocking: keep it off the event loop.
        await asyncio.to_thread(
            self._client.put_object,
            Bucket=self._bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
            CacheControl=CACHE_CONTROL,
            **extra,
        )


class LocalStorage:
    def __init__(self, root: Path) -> None:
        self._root = root

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        path = self._root / key
        await asyncio.to_thread(path.parent.mkdir, parents=True, exist_ok=True)
        await asyncio.to_thread(path.write_bytes, data)


def build_storage(settings: Settings) -> ObjectStorage:
    if settings.media_storage == "s3":
        client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url or None,
            region_name=settings.s3_region or None,
            aws_access_key_id=settings.s3_access_key_id,
            aws_secret_access_key=settings.s3_secret_access_key,
            # Path-style (endpoint/bucket/key) works on every S3-compatible vendor.
            config=Config(s3={"addressing_style": "path"}),
        )
        return S3Storage(client, bucket=settings.s3_bucket, acl=settings.s3_object_acl)
    return LocalStorage(Path(settings.media_local_dir))
