"""Public API of the organization module (other modules import only this)."""

from poslite.organization.infrastructure.service import (
    DeviceInfo,
    OutletInfo,
    active_outlet_count,
    create_outlet,
    dining_table_changes,
    get_device,
    get_outlet,
    list_outlets,
    outlet_changes,
    outlet_profile,
    register_device,
    touch_device,
)

__all__ = [
    "DeviceInfo",
    "OutletInfo",
    "active_outlet_count",
    "create_outlet",
    "dining_table_changes",
    "get_device",
    "get_outlet",
    "list_outlets",
    "outlet_changes",
    "outlet_profile",
    "register_device",
    "touch_device",
]
