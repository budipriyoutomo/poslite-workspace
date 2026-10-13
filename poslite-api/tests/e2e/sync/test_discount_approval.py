"""06 Order rule 5: manual discounts above the brand's cashier limits need a manager's approval.

The sale is never refused (the customer already paid); an unapproved one is flagged."""

import copy
from typing import Any

from httpx import AsyncClient

from ..identity.helpers import bearer
from .helpers import Setup, outlet_with_menu_and_device, pull
from .test_push import batch, push

POLICY = {
    "percentages": [5, 10],
    "amounts": [5000],
    "allow_custom": False,
    "cashier_max_percentage": 10,
    "cashier_max_amount": 20000,
}


async def _set_policy(api: AsyncClient, s: Setup, policy: dict[str, Any]) -> None:
    response = await api.put(
        f"/api/v1/brands/{s.brand_id}",
        json={"code": "MAHARASA", "name": "Warung Maharasa", "discount": policy},
        headers=bearer(s.owner_token),
    )
    assert response.status_code == 200, response.text


def _with_order_discount(s: Setup, percent: int, approved_by: str | None) -> list[dict[str, Any]]:
    opened, _, placed, _ = batch(s)
    order = copy.deepcopy(placed)
    order["payload"]["discount"] = {"type": "percentage", "value": percent}
    order["payload"]["discount_approved_by"] = approved_by
    return [opened, order]


async def _order_flags(api: AsyncClient, s: Setup, events: list[dict[str, Any]]) -> list[str]:
    results = (await push(api, s.device_token, events)).json()["data"]["results"]
    flags: list[str] = results[1].get("flags") or []
    return flags


async def test_the_brand_policy_reaches_the_device(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    await _set_policy(api, s, POLICY)

    brands = (await api.get("/api/v1/brands", headers=bearer(s.owner_token))).json()["data"]
    setting = next(
        c for c in (await pull(api, s.device_token))["changes"] if c["entity"] == "outlet_setting"
    )

    assert brands[0]["discount"] == POLICY
    assert setting["data"]["discount_policy"] == POLICY


async def test_a_brand_starts_with_the_old_presets_and_a_20_percent_cashier_limit(
    api: AsyncClient,
) -> None:
    s = await outlet_with_menu_and_device(api)

    brands = (await api.get("/api/v1/brands", headers=bearer(s.owner_token))).json()["data"]

    assert brands[0]["discount"] == {
        "percentages": [5, 10, 15, 20],
        "amounts": [5000, 10000, 25000, 50000],
        "allow_custom": True,
        "cashier_max_percentage": 20,
        "cashier_max_amount": 50000,
    }


async def test_a_cashier_discount_above_the_limit_without_a_manager_is_flagged(
    api: AsyncClient,
) -> None:
    s = await outlet_with_menu_and_device(api)
    await _set_policy(api, s, POLICY)

    flags = await _order_flags(api, s, _with_order_discount(s, 15, approved_by=None))

    assert "DISCOUNT_UNAPPROVED" in flags


async def test_a_manager_approval_lets_the_discount_through(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    await _set_policy(api, s, POLICY)

    flags = await _order_flags(api, s, _with_order_discount(s, 15, approved_by=s.ids["owner"]))

    assert "DISCOUNT_UNAPPROVED" not in flags


async def test_a_discount_within_the_limit_needs_nobody(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    flags = await _order_flags(api, s, _with_order_discount(s, 10, approved_by=None))

    assert flags == []
