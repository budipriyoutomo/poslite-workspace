"""Regenerate the import-linter contracts in pyproject.toml from the module list.

Usage: uv run python -m poslite.tools.gen_import_contracts tenancy,identity,...

Every module gets a layers contract, a pure domain, and may use other modules only through their
api.py (05-backend-architecture.md). Everything from the "# Layer & module boundaries" marker to
the end of pyproject.toml is replaced.
"""

import sys
from pathlib import Path

MARKER = "# Layer & module boundaries"
LAYERS = ("domain", "application", "infrastructure", "presentation")
FORBIDDEN_LIBS = [
    "fastapi",
    "pydantic",
    "pydantic_settings",
    "sqlalchemy",
    "redis",
    "arq",
    "structlog",
    "starlette",
]


def _list(items: list[str]) -> str:
    return "[" + ", ".join(f'"{i}"' for i in items) + "]"


def contracts(modules: list[str]) -> str:
    pkgs = [f"poslite.{m}" for m in modules]
    out = [
        f"{MARKER} (05-backend-architecture.md), generated from the module list:",
        "# every module has a layers contract, a pure domain, and may use other modules only"
        " via api.py.",
        "# Regenerate: uv run python -m poslite.tools.gen_import_contracts " + ",".join(modules),
        "[tool.importlinter]",
        'root_packages = ["poslite"]',
        "include_external_packages = true",
        "",
        "[[tool.importlinter.contracts]]",
        'name = "shared kernel layers"',
        'type = "layers"',
        "layers = [",
        *[f'    "poslite.shared.{layer}",' for layer in reversed(LAYERS)],
        "]",
        "",
        "[[tool.importlinter.contracts]]",
        'name = "module layers"',
        'type = "layers"',
        f"containers = {_list(pkgs)}",
        'layers = ["api", "presentation", "infrastructure", "application", "domain"]',
        "exhaustive = false",
        "",
        "[[tool.importlinter.contracts]]",
        'name = "domain is pure Python"',
        'type = "forbidden"',
        f"source_modules = {_list(['poslite.shared.domain', *[p + '.domain' for p in pkgs]])}",
        f"forbidden_modules = {_list(FORBIDDEN_LIBS)}",
    ]
    for module in modules:
        others = [f"poslite.{o}.{layer}" for o in modules if o != module for layer in LAYERS]
        out += [
            "",
            "[[tool.importlinter.contracts]]",
            f'name = "{module} uses other modules only through their api.py"',
            'type = "forbidden"',
            f'source_modules = ["poslite.{module}"]',
            "forbidden_modules = [",
            *[f'    "{o}",' for o in others],
            "]",
            "allow_indirect_imports = true",
        ]
    return "\n".join(out) + "\n"


def main() -> None:
    modules = sys.argv[1].split(",")
    path = Path("pyproject.toml")
    text = path.read_text()
    path.write_text(text[: text.index(MARKER)] + contracts(modules))


if __name__ == "__main__":
    main()
