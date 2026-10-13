from dataclasses import dataclass
from typing import Any

from httpx import AsyncClient

from ..identity.helpers import SIGNUP, bearer, signup


@dataclass
class Setup:
    owner_token: str
    device_token: str
    device_id: str
    outlet_id: str
    brand_id: str
    ids: dict[str, str]


async def post(api: AsyncClient, token: str, path: str, body: dict[str, Any]) -> dict[str, Any]:
    response = await api.post(f"/api/v1{path}", json=body, headers=bearer(token))
    assert response.status_code == 201, response.text
    data: dict[str, Any] = response.json()["data"]
    return data


async def outlet_with_menu_and_device(api: AsyncClient, **signup_overrides: Any) -> Setup:
    """A tenant with one outlet, a small menu, cash + QRIS, a cashier with a PIN, and a device."""
    owner = await signup(api, **signup_overrides)
    token = owner["token"]
    outlet_id = (await api.get("/api/v1/outlets", headers=bearer(token))).json()["data"][0]["id"]
    settings = {
        "name": "Outlet",
        "timezone": "Asia/Jakarta",
        "business_day_cutoff": "04:00",
        "tax_rate_bps": 1000,
        "service_rate_bps": 500,
    }
    assert (
        await api.put(f"/api/v1/outlets/{outlet_id}", json=settings, headers=bearer(token))
    ).status_code == 200
    drinks = await post(api, token, "/categories", {"name": "Minuman", "print_role": "bar"})
    sugar = await post(
        api,
        token,
        "/modifier-groups",
        {
            "name": "Level Gula",
            "min_select": 1,
            "max_select": 1,
            "options": [{"name": "Normal"}, {"name": "Less"}],
        },
    )
    es_teh = await post(
        api,
        token,
        "/products",
        {
            "category_id": drinks["id"],
            "sku": "MN-1",
            "name": "Es Teh",
            "price": 5000,
            "modifier_group_ids": [sugar["id"]],
        },
    )
    cash = await post(
        api, token, "/payment-methods", {"type": "cash", "name": "Tunai", "sort_order": 1}
    )
    qris = await post(
        api, token, "/payment-methods", {"type": "qris", "name": "QRIS", "sort_order": 2}
    )
    siti = await post(
        api,
        token,
        "/users",
        {"name": "Siti", "pin": "1234", "outlets": [{"outlet_id": outlet_id, "role": "cashier"}]},
    )
    email = signup_overrides.get("email", SIGNUP["email"])
    activated = (
        await api.post(
            "/api/v1/devices/activate",
            json={
                "email": email,
                "password": SIGNUP["password"],
                "outlet_id": outlet_id,
                "device_name": "Kasir 1",
            },
        )
    ).json()["data"]
    return Setup(
        owner_token=token,
        device_token=activated["token"],
        device_id=activated["device"]["id"],
        outlet_id=outlet_id,
        brand_id=owner["brand_id"],
        ids={
            "category": drinks["id"],
            "group": sugar["id"],
            "product": es_teh["id"],
            "cash": cash["id"],
            "qris": qris["id"],
            "siti": siti["id"],
            "owner": owner["user"]["id"],
        },
    )


async def pull(api: AsyncClient, token: str, cursor: int = 0, limit: int = 500) -> dict[str, Any]:
    response = await api.get(
        f"/api/v1/sync/pull?cursor={cursor}&limit={limit}", headers=bearer(token)
    )
    assert response.status_code == 200, response.text
    data: dict[str, Any] = response.json()["data"]
    return data
