"""Bootstrap a platform operator: `python -m poslite.platform_admin create-admin EMAIL NAME`.

The password is read without echo (never from argv, so it stays out of shell history).
"""

import argparse
import asyncio
import getpass

from poslite.platform_admin.api import create_admin
from poslite.shared.config import get_settings
from poslite.shared.infrastructure.database import create_engine, session_factory


async def _create(email: str, name: str, password: str) -> str:
    engine = create_engine(get_settings().system_database_url)
    try:
        return await create_admin(
            session_factory(engine), email=email, name=name, password=password
        )
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m poslite.platform_admin")
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create-admin", help="create a platform operator account")
    create.add_argument("email")
    create.add_argument("name")
    args = parser.parse_args()
    password = getpass.getpass("Password (min. 12 characters): ")
    if len(password) < 12 or password != getpass.getpass("Repeat password: "):
        parser.error("passwords must match and be at least 12 characters")
    admin_id = asyncio.run(_create(args.email, args.name, password))
    print(f"created platform admin {admin_id}")  # noqa: T201 — CLI output


if __name__ == "__main__":
    main()
