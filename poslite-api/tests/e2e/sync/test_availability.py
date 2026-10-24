"""P1-2: a cashier or manager marks a menu item sold out from the POS, offline if need be. The
event reaches the server, which keeps it for the outlet; the other devices learn it by pull. The
latest change wins, and a sold-out mark with an end time lifts by itself."""

from typing import Any

from httpx import AsyncClient

from poslite.shared.domain.ids import new_ulid

from ..identity.helpers import bearer
from .helpers import Setup, outlet_with_menu_and_device, post, pull
from .test_push import push, statuses

TONIGHT = "2026-09-25T21:00:00+00:00"  # 04:00 WIB the next day: end of the business date


def changed(
    s: Setup, *, available: bool, until: str | None, at: str, by: str | None = None
) -> dict[str, Any]:
    return {
        "id": new_ulid(),
        "type": "product.availability_changed",
        "aggregate_id": s.ids["product"],
        "occurred_at": at,
        "payload": {
            "product_id": s.ids["product"],
            "is_available": available,
            "until": until,
            "changed_by": by or s.ids["siti"],
        },
    }


async def _product(api: AsyncClient, s: Setup) -> dict[str, Any]:
    changes = (await pull(api, s.device_token))["changes"]
    data: dict[str, Any] = next(c for c in changes if c["id"] == s.ids["product"])["data"]
    return data


async def test_a_cashier_marks_an_item_sold_out_until_the_end_of_the_day(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    response = await push(
        api, s.device_token, [changed(s, available=False, until=TONIGHT, at="2026-09-25T05:00:00Z")]
    )

    assert statuses(response) == ["accepted"]
    product = await _product(api, s)
    assert (product["is_available"], product["unavailable_until"]) == (
        False,
        "2026-09-25T21:00:00Z",
    )


async def test_sold_out_until_switched_back_on_has_no_end(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    await push(
        api, s.device_token, [changed(s, available=False, until=None, at="2026-09-25T05:00:00Z")]
    )

    product = await _product(api, s)
    assert (product["is_available"], product["unavailable_until"]) == (False, None)


async def test_the_latest_change_wins_whatever_order_it_arrives_in(api: AsyncClient) -> None:
    """Tablet B switched it back on later than tablet A marked it sold out, but synced first."""
    s = await outlet_with_menu_and_device(api)
    back_on = changed(s, available=True, until=None, at="2026-09-25T06:00:00Z")
    sold_out = changed(s, available=False, until=None, at="2026-09-25T05:00:00Z")

    assert statuses(await push(api, s.device_token, [back_on, sold_out])) == ["accepted"] * 2

    assert (await _product(api, s))["is_available"] is True


async def test_a_waiter_cannot_mark_an_item_sold_out(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    waiter = await post(
        api,
        s.owner_token,
        "/users",
        {"name": "Dewi", "pin": "1357", "outlets": [{"outlet_id": s.outlet_id, "role": "waiter"}]},
    )

    response = await push(
        api,
        s.device_token,
        [changed(s, available=False, until=None, at="2026-09-25T05:00:00Z", by=waiter["id"])],
    )

    result = response.json()["data"]["results"][0]
    assert (result["status"], result["code"]) == ("rejected", "APPROVER_NOT_ALLOWED")


async def test_an_item_of_another_brand_is_refused(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    event = changed(s, available=False, until=None, at="2026-09-25T05:00:00Z")
    event["payload"]["product_id"] = new_ulid()

    result = (await push(api, s.device_token, [event])).json()["data"]["results"][0]

    assert (result["status"], result["code"]) == ("rejected", "PRODUCT_NOT_FOUND")


async def test_the_back_office_sees_the_item_sold_out(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    await push(
        api, s.device_token, [changed(s, available=False, until=None, at="2026-09-25T05:00:00Z")]
    )

    listed = (
        await api.get(f"/api/v1/outlets/{s.outlet_id}/products", headers=bearer(s.owner_token))
    ).json()["data"]

    assert [p["is_available"] for p in listed if p["product_id"] == s.ids["product"]] == [False]
