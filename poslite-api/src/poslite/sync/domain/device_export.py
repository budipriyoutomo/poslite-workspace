"""Emergency export files (ADR-024): a device's not-yet-accepted events, imported by a manager.

The checksum only detects a damaged file, not a forged one; every event is still validated like
a normal push, on behalf of the device that wrote it.
"""

import hashlib
import json
from dataclasses import dataclass

from poslite.shared.domain.errors import DomainError

FORMAT, VERSION = "poslite-device-export", 1


@dataclass(frozen=True, slots=True)
class DeviceExport:
    tenant_id: str | None  # optional: devices do not store their company id (RLS still fences it)
    outlet_id: str
    device_id: str
    events: list[dict[str, object]]
    checksum: str


def canonical_checksum(events: list[object]) -> str:
    """SHA-256 of the events as canonical JSON: sorted keys, no spaces, UTF-8 — the same bytes
    the device hashed (`canonicalJson` in poslite-web; tests/fixtures/device-export.json)."""
    text = json.dumps(events, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(text.encode()).hexdigest()


def parse_export(raw: object) -> DeviceExport:
    if not isinstance(raw, dict) or raw.get("format") != FORMAT or raw.get("version") != VERSION:
        raise DomainError("EXPORT_INVALID", "Not a POSLite device export (v1)")
    tenant_id, outlet_id, device_id = (raw.get(k) for k in ("tenant_id", "outlet_id", "device_id"))
    events, checksum = raw.get("events"), raw.get("checksum")
    if (
        not isinstance(outlet_id, str)
        or not isinstance(device_id, str)
        or not (tenant_id is None or isinstance(tenant_id, str))
        or not isinstance(events, list)
        or not all(isinstance(e, dict) for e in events)
        or not isinstance(checksum, str)
    ):
        raise DomainError("EXPORT_INVALID", "The export file is incomplete")
    if canonical_checksum(events) != checksum:
        raise DomainError("EXPORT_CHECKSUM_MISMATCH", "The export file is damaged")
    return DeviceExport(tenant_id, outlet_id, device_id, events, checksum)
