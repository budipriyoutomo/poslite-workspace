import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from poslite.platform_admin.api import create_admin

from .helpers import ADMIN, SECRETS, sign_in


@pytest.fixture
async def admin_token(api: AsyncClient, system_engine: AsyncEngine) -> str:
    await create_admin(
        async_sessionmaker(system_engine),
        email=ADMIN["email"],
        name="Ops",
        password=ADMIN["password"],
    )
    SECRETS.clear()  # a fresh database: every operator sets 2FA up again
    token: str = (await sign_in(api, ADMIN["email"], ADMIN["password"]))["token"]
    return token
