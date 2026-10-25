import time
from typing import Any

from httpx import AsyncClient, Response

from poslite.platform_admin.domain.totp import totp

from ..identity.helpers import bearer

ADMIN = {"email": "ops@poslite.id", "password": "operator-rahasia"}


async def operator_login(api: AsyncClient, email: str, password: str) -> Response:
    return await api.post(
        "/api/v1/platform/auth/login", json={"email": email, "password": password}
    )


# The authenticator of each operator a test signed up (P1-8), by email.
SECRETS: dict[str, str] = {}


async def second_factor(
    api: AsyncClient, challenge: str, *, code: str | None = None, recovery_code: str | None = None
) -> Response:
    body = {"challenge_token": challenge, "code": code, "recovery_code": recovery_code}
    return await api.post("/api/v1/platform/auth/2fa", json=body)


async def sign_in(
    api: AsyncClient, email: str, password: str, *, keep_codes: bool = False
) -> dict[str, Any]:
    """Password, then TOTP; the first time sets 2FA up and remembers the secret."""
    started = await operator_login(api, email, password)
    assert started.status_code == 200, started.text
    data = started.json()["data"]
    if data["step"] == "setup":
        SECRETS[email] = data["totp_secret"]
    done = await second_factor(
        api, data["challenge_token"], code=totp(SECRETS[email], int(time.time()))
    )
    assert done.status_code == 200, done.text
    result: dict[str, Any] = done.json()["data"]
    return result


async def ops_get(api: AsyncClient, token: str, path: str) -> Any:
    response = await api.get(f"/api/v1/platform{path}", headers=bearer(token))
    assert response.status_code == 200, response.text
    return response.json()


async def ops_post(api: AsyncClient, token: str, path: str, body: Any = None) -> Response:
    return await api.post(f"/api/v1/platform{path}", json=body, headers=bearer(token))
