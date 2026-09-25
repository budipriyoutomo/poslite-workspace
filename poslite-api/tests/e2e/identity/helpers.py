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


async def signup(api: AsyncClient, **overrides: Any) -> dict[str, Any]:
    response = await api.post("/api/v1/tenants/signup", json={**SIGNUP, **overrides})
    assert response.status_code == 201, response.text
    data: dict[str, Any] = response.json()["data"]
    return data


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
