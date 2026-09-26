"""Write the API contract to openapi.json (committed; clients generate their types from it).

`uv run python -m poslite.tools.export_openapi` — CI fails when the committed file is stale.
"""

import json
from pathlib import Path

from poslite.main import create_app

DEFAULT_TARGET = Path(__file__).resolve().parents[3] / "openapi.json"


def export(target: Path = DEFAULT_TARGET) -> None:
    spec = create_app().openapi()
    target.write_text(json.dumps(spec, indent=2, sort_keys=True, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    export()
    print(f"wrote {DEFAULT_TARGET}")  # noqa: T201 — CLI output
