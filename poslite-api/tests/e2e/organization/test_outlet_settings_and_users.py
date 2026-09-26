import base64
import hashlib
from typing import Any

from httpx import AsyncClient

from ..identity.helpers import SIGNUP, bearer, signup


async def _outlet(api: AsyncClient, token: str) -> dict[str, Any]:
    outlet: dict[str, Any] = (await api.get("/api/v1/outlets", headers=bearer(token))).json()[
        "data"
    ][0]
    return outlet


async def test_updates_outlet_rates_and_receipt_text(api: AsyncClient) -> None:
    token = (await signup(api))["token"]
    outlet = await _outlet(api, token)

    response = await api.put(
        f"/api/v1/outlets/{outlet['id']}",
        json={
            "name": "Outlet Kemang",
            "timezone": "Asia/Jakarta",
            "business_day_cutoff": "04:00",
            "tax_rate_bps": 1000,
            "service_rate_bps": 500,
            "receipt_header": "Warung Maharasa",
            "receipt_footer": "Terima kasih",
        },
        headers=bearer(token),
    )

    assert response.status_code == 200
    assert response.json()["data"] | {"id": ""} == {
        "id": "",
        "code": "JKT01",
        "name": "Outlet Kemang",
        "timezone": "Asia/Jakarta",
        "business_day_cutoff": "04:00",
        "tax_rate_bps": 1000,
        "service_rate_bps": 500,
        "receipt_header": "Warung Maharasa",
        "receipt_footer": "Terima kasih",
    }


async def test_reads_outlet_settings_for_the_back_office_form(api: AsyncClient) -> None:
    token = (await signup(api))["token"]
    outlet = await _outlet(api, token)

    response = await api.get(f"/api/v1/outlets/{outlet['id']}", headers=bearer(token))

    assert response.status_code == 200
    assert response.json()["data"] == {
        "id": outlet["id"],
        "code": "JKT01",
        "name": "Outlet Kemang",
        "timezone": "Asia/Jakarta",
        "business_day_cutoff": "04:00",
        "tax_rate_bps": 1000,
        "service_rate_bps": 0,
        "receipt_header": "",
        "receipt_footer": "",
    }


async def test_reading_an_unknown_outlet_is_404(api: AsyncClient) -> None:
    token = (await signup(api))["token"]

    response = await api.get("/api/v1/outlets/01K5ZO00000000000000000009", headers=bearer(token))

    assert response.status_code == 404


async def test_creates_a_cashier_with_a_pin_the_device_can_verify(api: AsyncClient) -> None:
    token = (await signup(api))["token"]
    outlet = await _outlet(api, token)

    response = await api.post(
        "/api/v1/users",
        json={
            "name": "Siti",
            "pin": "1234",
            "outlets": [{"outlet_id": outlet["id"], "role": "cashier"}],
        },
        headers=bearer(token),
    )

    assert response.status_code == 201
    users = (await api.get("/api/v1/users", headers=bearer(token))).json()["data"]
    siti = next(u for u in users if u["name"] == "Siti")
    assert siti["outlets"] == [{"outlet_id": outlet["id"], "role": "cashier"}]
    assert "pin" not in siti
    assert "pin_hash" not in siti


async def test_changes_a_pin(api: AsyncClient) -> None:
    token = (await signup(api))["token"]
    outlet = await _outlet(api, token)
    siti = (
        await api.post(
            "/api/v1/users",
            json={
                "name": "Siti",
                "pin": "1234",
                "outlets": [{"outlet_id": outlet["id"], "role": "cashier"}],
            },
            headers=bearer(token),
        )
    ).json()["data"]

    response = await api.put(
        f"/api/v1/users/{siti['id']}/pin", json={"pin": "5678"}, headers=bearer(token)
    )

    assert response.status_code == 200


async def test_rejects_a_pin_that_is_not_4_to_6_digits(api: AsyncClient) -> None:
    token = (await signup(api))["token"]
    outlet = await _outlet(api, token)

    response = await api.post(
        "/api/v1/users",
        json={
            "name": "Siti",
            "pin": "12a4",
            "outlets": [{"outlet_id": outlet["id"], "role": "cashier"}],
        },
        headers=bearer(token),
    )

    assert response.status_code == 422


def test_pin_hash_format_matches_webcrypto() -> None:
    """Same derivation the device runs: PBKDF2-SHA256, 32 bytes, base64 (web pin-hasher)."""
    from poslite.identity.domain.pin import hash_pin

    salt = base64.b64encode(b"salt-siti").decode()
    expected = base64.b64encode(
        hashlib.pbkdf2_hmac("sha256", b"1234", b"salt-siti", 1000, 32)
    ).decode()

    assert hash_pin("1234", salt, 1000) == expected


async def test_rejects_a_back_office_user_whose_email_is_taken(api: AsyncClient) -> None:
    owner = await signup(api)
    outlet = await _outlet(api, owner["token"])

    response = await api.post(
        "/api/v1/users",
        json={
            "name": "Rina",
            "email": SIGNUP["email"].upper(),
            "password": "rahasia123",
            "outlets": [{"outlet_id": outlet["id"], "role": "manager"}],
        },
        headers=bearer(owner["token"]),
    )

    assert response.status_code == 409
    assert response.json()["code"] == "EMAIL_TAKEN"
