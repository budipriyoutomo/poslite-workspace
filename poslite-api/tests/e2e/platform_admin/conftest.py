import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from poslite.platform_admin.api import create_admin

from .helpers import ADMIN, operator_login


@pytest.fixture
async def admin_token(api: AsyncClient, system_engine: AsyncEngine) -> str:
    await create_admin(
        async_sessionmaker(system_engine),
        email=ADMIN["email"],
        name="Ops",
        password=ADMIN["password"],
    )
    response = await operator_login(api, ADMIN["email"], ADMIN["password"])
    assert response.status_code == 200, response.text
    token: str = response.json()["data"]["token"]
    return token
