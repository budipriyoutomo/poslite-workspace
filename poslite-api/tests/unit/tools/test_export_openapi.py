import json
from pathlib import Path

from poslite.tools.export_openapi import export


def test_writes_the_openapi_contract_with_stable_formatting(tmp_path: Path) -> None:
    target = tmp_path / "openapi.json"

    export(target)

    spec = json.loads(target.read_text())
    assert spec["info"]["title"] == "POSLite API"
    assert "/api/v1/sync/push" in spec["paths"]
    assert "/api/v1/reports/sales-summary/export" in spec["paths"]
    assert target.read_text().endswith("}\n")


def test_is_deterministic(tmp_path: Path) -> None:
    first, second = tmp_path / "a.json", tmp_path / "b.json"

    export(first)
    export(second)

    assert first.read_text() == second.read_text()
