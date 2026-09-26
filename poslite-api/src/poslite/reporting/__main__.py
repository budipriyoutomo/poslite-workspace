"""`python -m poslite.reporting rebuild --from 2026-09-01 --to 2026-09-30` (make report-rebuild)."""

import argparse
import asyncio

from poslite.reporting.api import rebuild
from poslite.shared.config import get_settings
from poslite.shared.infrastructure.database import create_engine, session_factory


async def _rebuild(start: str, end: str) -> int:
    settings = get_settings()
    system, app = create_engine(settings.system_database_url), create_engine(settings.database_url)
    try:
        return await rebuild(
            system=session_factory(system), app=session_factory(app), start=start, end=end
        )
    finally:
        await system.dispose()
        await app.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m poslite.reporting")
    commands = parser.add_subparsers(dest="command", required=True)
    cmd = commands.add_parser("rebuild", help="recompute report tables from the orders")
    cmd.add_argument("--from", dest="start", required=True, help="YYYY-MM-DD")
    cmd.add_argument("--to", dest="end", required=True, help="YYYY-MM-DD")
    args = parser.parse_args()
    count = asyncio.run(_rebuild(args.start, args.end))
    print(f"rebuilt {count} outlet-day(s)")  # noqa: T201 — CLI output


if __name__ == "__main__":
    main()
