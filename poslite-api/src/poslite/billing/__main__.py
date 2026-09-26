"""Run the billing job once: `python -m poslite.billing run` (the worker also runs it daily)."""

import argparse
import asyncio
from datetime import UTC, datetime

from poslite.billing.api import run_billing
from poslite.shared.config import get_settings
from poslite.shared.infrastructure.database import create_engine, session_factory
from poslite.shared.infrastructure.gateways import build_gateway


async def _run() -> None:
    settings = get_settings()
    engine = create_engine(settings.system_database_url)
    try:
        stats = await run_billing(
            system=session_factory(engine),
            gateway=build_gateway(settings),
            now=datetime.now(UTC),
            price_per_outlet=settings.price_per_outlet,
        )
    finally:
        await engine.dispose()
    summary = f"trials {stats.started}, invoices {stats.issued}, suspended {stats.suspended}"
    print(summary)  # noqa: T201 — CLI output


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m poslite.billing")
    parser.add_argument("command", choices=["run"])
    parser.parse_args()
    asyncio.run(_run())


if __name__ == "__main__":
    main()
