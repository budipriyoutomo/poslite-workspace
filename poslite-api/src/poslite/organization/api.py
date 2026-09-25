"""Public API of the organization module (other modules import only this)."""

from poslite.organization.infrastructure.service import (
    DeviceInfo,
    OutletInfo,
    create_outlet,
    get_device,
    get_outlet,
    list_outlets,
    outlet_changes,
    register_device,
)

__all__ = [
    "DeviceInfo",
    "OutletInfo",
    "create_outlet",
    "get_device",
    "get_outlet",
    "list_outlets",
    "outlet_changes",
    "register_device",
]
