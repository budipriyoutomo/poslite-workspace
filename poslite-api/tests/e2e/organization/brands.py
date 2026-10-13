"""A company with two brands and managers at company, brand and outlet level (ADR-022).

Brand B, its outlet and the managers are written straight to the database: brands and
assignments get their own API later in Fase 6a.
"""

from dataclasses import dataclass

from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from poslite.identity.api import hash_password
from poslite.shared.infrastructure.tenancy import set_tenant

from ..identity.helpers import SIGNUP, signup

PASSWORD = SIGNUP["password"]
BRAND_B = "01K5ZB0000000000000000000B"
OUTLET_B1 = "01K5Z00000000000000000000B"
MANAGER = 2


@dataclass(frozen=True)
class Company:
    owner: str
    brand_a_manager: str
    brand_b_manager: str
    outlet_a1_manager: str
    brand_a: str
    brand_b: str
    outlet_a1: str
    outlet_b1: str


async def _login(api: AsyncClient, email: str) -> str:
    response = await api.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    token: str = response.json()["data"]["token"]
    return token


async def company_with_two_brands(api: AsyncClient, app_engine: AsyncEngine) -> Company:
    owner = await signup(api)
    password_hash = await hash_password(PASSWORD)
    async with app_engine.begin() as conn:
        await set_tenant(conn, owner["tenant"]["id"])
        tenant = {"t": owner["tenant"]["id"]}
        brand_a, outlet_a1 = (await conn.execute(text("SELECT brand_id, id FROM outlets"))).one()
        await conn.execute(
            text(
                "INSERT INTO brands (id, tenant_id, code, name) VALUES (:b, :t, 'SUSHI', 'Sushi')"
            ),
            {**tenant, "b": BRAND_B},
        )
        await conn.execute(
            text(
                "INSERT INTO outlets (id, tenant_id, brand_id, code, name)"
                " VALUES (:o, :t, :b, 'BDG01', 'Sushi Dago')"
            ),
            {**tenant, "o": OUTLET_B1, "b": BRAND_B},
        )
        managers = [
            ("01K5ZU0000000000000000000A", "a@maharasa.id", "brand", brand_a, None),
            ("01K5ZU0000000000000000000B", "b@maharasa.id", "brand", BRAND_B, None),
            ("01K5ZU0000000000000000000C", "c@maharasa.id", "outlet", brand_a, outlet_a1),
        ]
        for user_id, email, scope_type, brand_id, outlet_id in managers:
            await conn.execute(
                text(
                    "INSERT INTO users (id, tenant_id, name, email, password_hash)"
                    " VALUES (:u, :t, :e, :e, :p)"
                ),
                {**tenant, "u": user_id, "e": email, "p": password_hash},
            )
            await conn.execute(
                text(
                    "INSERT INTO user_assignments"
                    " (id, tenant_id, user_id, role_id, scope_type, brand_id, outlet_id)"
                    " VALUES (:u, :t, :u, :r, :s, :b, :o)"
                ),
                {
                    **tenant,
                    "u": user_id,
                    "r": MANAGER,
                    "s": scope_type,
                    "b": brand_id,
                    "o": outlet_id,
                },
            )
    return Company(
        owner=owner["token"],
        brand_a_manager=await _login(api, "a@maharasa.id"),
        brand_b_manager=await _login(api, "b@maharasa.id"),
        outlet_a1_manager=await _login(api, "c@maharasa.id"),
        brand_a=brand_a,
        brand_b=BRAND_B,
        outlet_a1=outlet_a1,
        outlet_b1=OUTLET_B1,
    )


def as_user(token: str, brand_id: str | None = None) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {token}"}
    if brand_id is not None:
        headers["X-Brand-Id"] = brand_id
    return headers
