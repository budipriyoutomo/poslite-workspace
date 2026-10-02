from collections.abc import Callable

from poslite.catalog.application.schemas import ImageOut
from poslite.shared.application.object_storage import ObjectStorage
from poslite.shared.domain.media import CONTENT_TYPES, image_extension, media_url


async def upload_product_image(
    storage: ObjectStorage,
    data: bytes,
    *,
    tenant_id: str,
    new_id: Callable[[], str],
    base_url: str,
) -> ImageOut:
    """Store a product image under the tenant's prefix (ADR-021); a new key for every upload."""
    ext = image_extension(data)
    key = f"{tenant_id}/products/{new_id()}.{ext}"
    await storage.put(key, data, CONTENT_TYPES[ext])
    return ImageOut(key=key, url=media_url(base_url, key) or "")
