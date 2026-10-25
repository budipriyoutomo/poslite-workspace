"""P1-8: every operator signs in with a password and a TOTP code. The first sign-in sets 2FA up
and hands out 10 one-time recovery codes; another operator can reset a lost authenticator."""

import time

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from poslite.platform_admin.api import create_admin
from poslite.platform_admin.domain.totp import totp

from ..identity.helpers import bearer
from .helpers import ADMIN, SECRETS, operator_login, ops_get, ops_post, second_factor, sign_in


async def _operator(system_engine: AsyncEngine) -> None:
    await create_admin(
        async_sessionmaker(system_engine),
        email=ADMIN["email"],
        name="Ops",
        password=ADMIN["password"],
    )


async def test_the_first_sign_in_sets_up_2fa_with_recovery_codes(
    api: AsyncClient, system_engine: AsyncEngine
) -> None:
    await _operator(system_engine)

    started = (await operator_login(api, ADMIN["email"], ADMIN["password"])).json()["data"]
    assert started["step"] == "setup"
    assert started["otpauth_uri"].startswith("otpauth://totp/POSLite%20Operator:")
    done = await second_factor(
        api, started["challenge_token"], code=totp(started["totp_secret"], int(time.time()))
    )

    assert done.status_code == 200, done.text
    data = done.json()["data"]
    assert len(data["recovery_codes"]) == 10
    assert (await ops_get(api, data["token"], "/me"))["data"]["email"] == ADMIN["email"]


async def test_a_password_alone_never_opens_the_console(
    api: AsyncClient, system_engine: AsyncEngine
) -> None:
    await _operator(system_engine)
    started = (await operator_login(api, ADMIN["email"], ADMIN["password"])).json()["data"]

    response = await api.get("/api/v1/platform/me", headers=bearer(started["challenge_token"]))

    assert response.status_code == 401


async def test_the_next_sign_in_asks_for_a_code_and_refuses_a_wrong_one(
    api: AsyncClient, system_engine: AsyncEngine
) -> None:
    await _operator(system_engine)
    await sign_in(api, ADMIN["email"], ADMIN["password"])

    started = (await operator_login(api, ADMIN["email"], ADMIN["password"])).json()["data"]
    wrong = await second_factor(api, started["challenge_token"], code="000000")

    assert (started["step"], "totp_secret" in started) == ("verify", False)
    assert (wrong.status_code, wrong.json()["code"]) == (401, "INVALID_2FA_CODE")


async def test_a_recovery_code_works_once(api: AsyncClient, system_engine: AsyncEngine) -> None:
    await _operator(system_engine)
    first = await sign_in(api, ADMIN["email"], ADMIN["password"], keep_codes=True)
    code = first["recovery_codes"][0]

    started = (await operator_login(api, ADMIN["email"], ADMIN["password"])).json()["data"]
    used = await second_factor(api, started["challenge_token"], recovery_code=code)
    again_started = (await operator_login(api, ADMIN["email"], ADMIN["password"])).json()["data"]
    again = await second_factor(api, again_started["challenge_token"], recovery_code=code)

    assert used.status_code == 200, used.text
    assert again.status_code == 401


async def test_another_operator_resets_a_lost_authenticator_and_it_is_audited(
    api: AsyncClient, system_engine: AsyncEngine
) -> None:
    await _operator(system_engine)
    token = (await sign_in(api, ADMIN["email"], ADMIN["password"]))["token"]
    rina = (
        await ops_post(
            api,
            token,
            "/operators",
            {"email": "rina@poslite.id", "name": "Rina", "password": "rahasia-rina-1"},
        )
    ).json()["data"]
    await sign_in(api, "rina@poslite.id", "rahasia-rina-1")

    reset = await ops_post(api, token, f"/operators/{rina['id']}/reset-2fa")
    started = (await operator_login(api, "rina@poslite.id", "rahasia-rina-1")).json()["data"]

    assert reset.status_code == 200, reset.text
    assert started["step"] == "setup"
    actions = [e["action"] for e in (await ops_get(api, token, "/audit"))["data"]]
    assert {"operator.2fa_enabled", "operator.2fa_reset"} <= set(actions)
    SECRETS.pop("rina@poslite.id", None)
