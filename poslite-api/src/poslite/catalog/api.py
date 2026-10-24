"""Public API of the catalog module (other modules import only this)."""

from poslite.catalog.application.availability import ChangeAvailabilityHandler
from poslite.catalog.domain.availability import ChangeAvailability
from poslite.catalog.infrastructure.availability import (
    apply_availability,
    last_availability_change,
    product_in_brand,
)
from poslite.catalog.infrastructure.channels import (
    channel_changes,
    channel_info,
    channel_labels,
    default_channel,
    seed_channels,
)
from poslite.catalog.infrastructure.service import catalog_changes, ensure_menu_in_brand

__all__ = [
    "ChangeAvailability",
    "ChangeAvailabilityHandler",
    "apply_availability",
    "catalog_changes",
    "channel_changes",
    "channel_info",
    "channel_labels",
    "default_channel",
    "ensure_menu_in_brand",
    "last_availability_change",
    "product_in_brand",
    "seed_channels",
]
