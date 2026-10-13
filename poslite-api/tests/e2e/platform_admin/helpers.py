from typing import Any

from httpx import AsyncClient, Response

from ..identity.helpers import bearer

ADMIN = {"email": "ops@poslite.id", "password": "operator-rahasia"}


async def operator_login(api: AsyncClient, email: str, password: str) -> Response:
    return await api.post(
        "/api/v1/platform/auth/login", json={"email": email, "password": password}
    )


async def ops_get(api: AsyncClient, token: str, path: str) -> Any:
    response = await api.get(f"/api/v1/platform{path}", headers=bearer(token))
    assert response.status_code == 200, response.text
    return response.json()


async def ops_post(api: AsyncClient, token: str, path: str, body: Any = None) -> Response:
    return await api.post(f"/api/v1/platform{path}", json=body, headers=bearer(token))
