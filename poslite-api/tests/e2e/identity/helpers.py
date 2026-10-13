from typing import Any

from httpx import AsyncClient

SIGNUP = {
    "business_name": "Warung Maharasa",
    "slug": "maharasa",
    "owner_name": "Budi",
    "email": "budi@maharasa.id",
    "password": "rahasia-123",
    "outlet": {"code": "JKT01", "name": "Outlet Kemang", "timezone": "Asia/Jakarta"},
}


# Active brand per token (ADR-022): like the back-office, a signed-up owner works in the
# company's first brand unless a test says otherwise.
_ACTIVE_BRAND: dict[str, str] = {}


async def signup(api: AsyncClient, **overrides: Any) -> dict[str, Any]:
    response = await api.post("/api/v1/tenants/signup", json={**SIGNUP, **overrides})
    assert response.status_code == 201, response.text
    data: dict[str, Any] = response.json()["data"]
    access = await api.get(
        "/api/v1/me/access", headers={"Authorization": f"Bearer {data['token']}"}
    )
    data["brand_id"] = access.json()["data"]["brands"][0]["id"]
    _ACTIVE_BRAND[data["token"]] = data["brand_id"]
    return data


def bearer(token: str) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {token}"}
    if token in _ACTIVE_BRAND:
        headers["X-Brand-Id"] = _ACTIVE_BRAND[token]
    return headers
