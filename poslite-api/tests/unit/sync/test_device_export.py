"""ADR-024: an emergency export file is checked before its events are pushed for its device."""

import copy
import json
from pathlib import Path
from typing import Any

import pytest

from poslite.shared.domain.errors import DomainError
from poslite.sync.domain.device_export import parse_export

FILE: dict[str, Any] = json.loads(
    (Path(__file__).parents[2] / "fixtures" / "device-export.json").read_text()
)


def test_reads_the_file_the_device_wrote() -> None:
    export = parse_export(copy.deepcopy(FILE))

    assert (export.tenant_id, export.outlet_id, export.device_id) == (
        FILE["tenant_id"],
        FILE["outlet_id"],
        FILE["device_id"],
    )
    assert [e["type"] for e in export.events] == [
        "shift.opened",
        "cash.moved",
        "order.placed",
        "shift.closed",
    ]


def test_a_device_that_does_not_know_its_company_leaves_tenant_id_empty() -> None:
    assert parse_export({**copy.deepcopy(FILE), "tenant_id": None}).tenant_id is None


def _broken(**changes: Any) -> dict[str, Any]:
    return {**copy.deepcopy(FILE), **changes}


@pytest.mark.parametrize(
    ("raw", "code"),
    [
        (_broken(format="something-else"), "EXPORT_INVALID"),
        (_broken(version=2), "EXPORT_INVALID"),
        (_broken(events="nope"), "EXPORT_INVALID"),
        (_broken(device_id=None), "EXPORT_INVALID"),
        (_broken(checksum="0" * 64), "EXPORT_CHECKSUM_MISMATCH"),
        (_broken(events=FILE["events"][:2]), "EXPORT_CHECKSUM_MISMATCH"),
    ],
)
def test_rejects_a_file_it_cannot_trust(raw: dict[str, Any], code: str) -> None:
    with pytest.raises(DomainError) as error:
        parse_export(raw)

    assert error.value.code == code
