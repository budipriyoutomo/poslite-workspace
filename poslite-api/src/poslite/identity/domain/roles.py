from typing import Literal

Role = Literal["owner", "manager", "cashier", "waiter"]

# Seeded by migrations 0002 and 0027 (global lookup table).
ROLE_IDS: dict[Role, int] = {"owner": 1, "manager": 2, "cashier": 3, "waiter": 4}
ROLE_BY_ID: dict[int, Role] = {v: k for k, v in ROLE_IDS.items()}
# A waiter takes orders but never money (ADR-031), so ranks below a cashier.
RANK: dict[Role, int] = {"owner": 3, "manager": 2, "cashier": 1, "waiter": 0}

BACKOFFICE_ABILITIES = frozenset({"backoffice:*"})
DEVICE_ABILITIES = frozenset({"device:sync", "device:read"})


def can_activate_devices(role: Role | None) -> bool:
    return role in ("owner", "manager")
