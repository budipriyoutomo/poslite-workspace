"""Operator accounts managed from the console: /platform/me and /platform/operators."""

from httpx import AsyncClient

from ..identity.helpers import bearer
from .helpers import ADMIN, operator_login, ops_get, ops_post, sign_in

NEW = {"email": "Rina@POSLite.id", "name": "Rina", "password": "rina-rahasia-123"}


async def test_me_is_the_signed_in_operator(api: AsyncClient, admin_token: str) -> None:
    me = (await ops_get(api, admin_token, "/me"))["data"]

    assert (me["email"], me["name"]) == (ADMIN["email"], "Ops")


async def test_creates_an_operator_who_can_sign_in(api: AsyncClient, admin_token: str) -> None:
    created = await ops_post(api, admin_token, "/operators", NEW)

    assert created.status_code == 201, created.text
    assert created.json()["data"]["email"] == "rina@poslite.id"
    assert (await operator_login(api, "rina@poslite.id", NEW["password"])).status_code == 200
    rows = (await ops_get(api, admin_token, "/operators"))["data"]
    assert [(o["email"], o["disabled_at"]) for o in rows] == [
        ("ops@poslite.id", None),
        ("rina@poslite.id", None),
    ]


async def test_an_operator_email_is_used_once(api: AsyncClient, admin_token: str) -> None:
    response = await ops_post(api, admin_token, "/operators", {**NEW, "email": "OPS@poslite.id"})

    assert (response.status_code, response.json()["code"]) == (409, "OPERATOR_EMAIL_TAKEN")


async def test_an_operator_password_has_at_least_12_characters(
    api: AsyncClient, admin_token: str
) -> None:
    response = await ops_post(api, admin_token, "/operators", {**NEW, "password": "pendek-123"})

    assert response.status_code == 422


async def test_a_disabled_operator_is_signed_out_and_cannot_sign_in(
    api: AsyncClient, admin_token: str
) -> None:
    rina_id = (await ops_post(api, admin_token, "/operators", NEW)).json()["data"]["id"]
    rina_token = (await sign_in(api, NEW["email"], NEW["password"]))["token"]

    disabled = await ops_post(api, admin_token, f"/operators/{rina_id}/disable")

    assert disabled.status_code == 200, disabled.text
    assert (await api.get("/api/v1/platform/me", headers=bearer(rina_token))).status_code == 401
    refused = await operator_login(api, NEW["email"], NEW["password"])
    assert (refused.status_code, refused.json()["code"]) == (401, "INVALID_CREDENTIALS")

    assert (await ops_post(api, admin_token, f"/operators/{rina_id}/enable")).status_code == 200
    assert (await operator_login(api, NEW["email"], NEW["password"])).status_code == 200


async def test_an_operator_cannot_disable_themselves(api: AsyncClient, admin_token: str) -> None:
    me = (await ops_get(api, admin_token, "/me"))["data"]

    response = await ops_post(api, admin_token, f"/operators/{me['id']}/disable")

    assert (response.status_code, response.json()["code"]) == (409, "CANNOT_DISABLE_SELF")


async def test_unknown_operator_is_not_found(api: AsyncClient, admin_token: str) -> None:
    response = await ops_post(api, admin_token, "/operators/01K5ZT00000000000000000099/disable")

    assert (response.status_code, response.json()["code"]) == (404, "OPERATOR_NOT_FOUND")


async def test_operator_changes_are_audited(api: AsyncClient, admin_token: str) -> None:
    rina_id = (await ops_post(api, admin_token, "/operators", NEW)).json()["data"]["id"]
    await ops_post(api, admin_token, f"/operators/{rina_id}/disable")

    entries = (await ops_get(api, admin_token, "/audit"))["data"]

    me = (await ops_get(api, admin_token, "/me"))["data"]["id"]
    assert [(e["action"], e["target_id"], e["operator_name"]) for e in entries] == [
        ("operator.disable", rina_id, "Ops"),
        ("operator.create", rina_id, "Ops"),
        ("operator.2fa_enabled", me, "Ops"),  # the fixture's first sign-in (P1-8)
    ]
