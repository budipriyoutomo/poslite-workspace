"""Images in object storage (ADR-021): the database keeps a key, the URL is built on the way out."""

from poslite.shared.domain.errors import DomainError

MAX_IMAGE_BYTES = 2 * 1024 * 1024
CONTENT_TYPES = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}


def media_url(base_url: str, key: str | None) -> str | None:
    """Public URL of a stored object; a key that is already a URL (legacy, external) is kept."""
    if key is None:
        return None
    if "://" in key:
        return key
    return f"{base_url.rstrip('/')}/{key}"


def image_extension(data: bytes) -> str:
    """jpg/png/webp judged by the file's magic bytes, never by the client's Content-Type."""
    if len(data) > MAX_IMAGE_BYTES:
        raise DomainError("IMAGE_TOO_LARGE", "Image is larger than 2 MB")
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    raise DomainError("UNSUPPORTED_IMAGE", "Only JPEG, PNG or WebP images are accepted")
