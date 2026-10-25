"""ADR-031: an outlet in table_service mode keeps its open bills on the server. A waiter's tablet
opens a bill, the cashier's device sees it and is paid on it; one device edits a bill at a time."""

import asyncio
import copy
from typing import Any

from httpx import AsyncClient, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from poslite.shared.domain.ids import new_ulid

from ..identity.helpers import bearer
from .helpers import Setup, outlet_with_menu_and_device, post, pull
from .test_dod_two_devices import second_device
from .test_push import batch, push

SETTINGS = {
    "name": "Outlet",
    "timezone": "Asia/Jakarta",
    "business_day_cutoff": "04:00",
    "tax_rate_bps": 1000,
    "service_rate_bps": 500,
}


async def _set_mode(api: AsyncClient, s: Setup, mode: str) -> Response:
    return await api.put(
        f"/api/v1/outlets/{s.outlet_id}",
        json={**SETTINGS, "service_mode": mode},
        headers=bearer(s.owner_token),
    )


async def _table_service(api: AsyncClient) -> tuple[Setup, str]:
    """A table-service outlet: the first device is the cashier's, the second a waiter's tablet."""
    s = await outlet_with_menu_and_device(api)
    assert (await _set_mode(api, s, "table_service")).status_code == 200
    waiter_token, _ = await second_device(api, s.outlet_id)
    return s, waiter_token


def _line(s: Setup, quantity: int = 1, sent: int = 0) -> dict[str, Any]:
    return {
        "key": "L1",
        "productId": s.ids["product"],
        "name": "Es Teh",
        "categoryName": "Minuman",
        "unitPrice": 5000,
        "modifiers": [],
        "note": "",
        "quantity": quantity,
        "sentQuantity": sent,
    }


def _new_bill(s: Setup, **overrides: Any) -> dict[str, Any]:
    return {
        "id": new_ulid(),
        "table_id": None,
        "table_label": "A3",
        "lines": [_line(s)],
        "discount": None,
        "opened_by": s.ids["siti"],
        "opened_at": "2026-10-24T05:00:00+00:00",
        "user_id": s.ids["siti"],
        **overrides,
    }


async def _open(api: AsyncClient, token: str, bill: dict[str, Any]) -> dict[str, Any]:
    response = await api.post("/api/v1/open-bills", json=bill, headers=bearer(token))
    assert response.status_code == 201, response.text
    data: dict[str, Any] = response.json()["data"]
    return data


async def _bills(api: AsyncClient, token: str) -> list[dict[str, Any]]:
    response = await api.get("/api/v1/open-bills", headers=bearer(token))
    assert response.status_code == 200, response.text
    data: list[dict[str, Any]] = response.json()["data"]
    return data


async def _lease(api: AsyncClient, token: str, bill_id: str, user_id: str) -> Response:
    return await api.post(
        f"/api/v1/open-bills/{bill_id}/lease", json={"user_id": user_id}, headers=bearer(token)
    )


async def _save(
    api: AsyncClient, token: str, bill: dict[str, Any], version: int, quantity: int
) -> Response:
    body = {
        "version": version,
        "table_id": bill["table_id"],
        "table_label": bill["table_label"],
        "lines": [{**bill["lines"][0], "quantity": quantity}],
        "discount": None,
        "user_id": bill["opened_by"],
    }
    return await api.put(f"/api/v1/open-bills/{bill['id']}", json=body, headers=bearer(token))


async def _expire_leases(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE open_bills SET lease_until = now() - interval '1 second'"))


async def test_an_outlet_starts_in_counter_mode_and_the_device_learns_the_mode(
    api: AsyncClient,
) -> None:
    s = await outlet_with_menu_and_device(api)

    def mode(page: dict[str, Any]) -> str:
        setting = next(c for c in page["changes"] if c["entity"] == "outlet_setting")
        value: str = setting["data"]["service_mode"]
        return value

    assert mode(await pull(api, s.device_token)) == "counter"
    changed = await _set_mode(api, s, "table_service")
    assert (changed.status_code, changed.json()["data"]["service_mode"]) == (200, "table_service")
    assert mode(await pull(api, s.device_token)) == "table_service"


async def test_a_counter_outlet_keeps_its_bills_on_the_device(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    response = await api.post(
        "/api/v1/open-bills", json=_new_bill(s), headers=bearer(s.device_token)
    )

    assert (response.status_code, response.json()["code"]) == (409, "NOT_TABLE_SERVICE")


async def test_the_cashier_sees_the_bill_a_waiter_opened(api: AsyncClient) -> None:
    s, waiter = await _table_service(api)
    bill = _new_bill(s)

    opened = await _open(api, waiter, bill)

    assert opened["version"] == 1
    listed = await _bills(api, s.device_token)
    assert [(b["id"], b["table_label"], b["lines"], b["version"]) for b in listed] == [
        (bill["id"], "A3", bill["lines"], 1)
    ]
    lease = listed[0]["lease"]
    assert (lease["device_name"], lease["user_id"]) == ("Kasir 2", s.ids["siti"])


async def test_opening_the_same_bill_twice_is_harmless(api: AsyncClient) -> None:
    """A device retries after a timeout: the bill is not duplicated."""
    s, waiter = await _table_service(api)
    bill = _new_bill(s)
    await _open(api, waiter, bill)

    again = await _open(api, waiter, bill)

    assert again["version"] == 1
    assert len(await _bills(api, s.device_token)) == 1


async def test_a_table_holds_one_open_bill(api: AsyncClient) -> None:
    s, waiter = await _table_service(api)
    table = await post(api, s.owner_token, f"/outlets/{s.outlet_id}/tables", {"label": "A3"})
    await _open(api, waiter, _new_bill(s, table_id=table["id"]))

    second = await api.post(
        "/api/v1/open-bills",
        json=_new_bill(s, table_id=table["id"]),
        headers=bearer(s.device_token),
    )

    assert (second.status_code, second.json()["code"]) == (409, "TABLE_OCCUPIED")


async def test_one_device_edits_a_bill_at_a_time(api: AsyncClient) -> None:
    s, waiter = await _table_service(api)
    bill = await _open(api, waiter, _new_bill(s))

    taken = await _lease(api, s.device_token, bill["id"], s.ids["owner"])
    assert (taken.status_code, taken.json()["code"]) == (409, "BILL_LEASED")

    released = await api.delete(f"/api/v1/open-bills/{bill['id']}/lease", headers=bearer(waiter))
    assert released.status_code == 200
    taken = await _lease(api, s.device_token, bill["id"], s.ids["owner"])
    assert taken.status_code == 200, taken.text
    assert taken.json()["data"]["lease"]["user_id"] == s.ids["owner"]


async def test_a_save_bumps_the_version_and_reaches_the_other_device(api: AsyncClient) -> None:
    s, waiter = await _table_service(api)
    bill = await _open(api, waiter, _new_bill(s))

    saved = await _save(api, waiter, bill, version=1, quantity=3)

    assert saved.status_code == 200, saved.text
    assert saved.json()["data"]["version"] == 2
    [seen] = await _bills(api, s.device_token)
    assert (seen["version"], seen["lines"][0]["quantity"]) == (2, 3)


async def test_a_save_that_leaves_the_screen_frees_the_bill(api: AsyncClient) -> None:
    """The waiter saves and puts the tablet down: the cashier can take the bill at once."""
    s, waiter = await _table_service(api)
    bill = await _open(api, waiter, {**_new_bill(s), "release_lease": True})
    assert bill["lease"] is None

    body = {**_new_bill(s), "version": 1, "release_lease": True}
    saved = await api.put(f"/api/v1/open-bills/{bill['id']}", json=body, headers=bearer(waiter))

    assert (saved.status_code, saved.json()["data"]["lease"]) == (200, None)
    assert (await _lease(api, s.device_token, bill["id"], s.ids["owner"])).status_code == 200


async def test_a_save_from_an_old_version_is_refused(api: AsyncClient) -> None:
    s, waiter = await _table_service(api)
    bill = await _open(api, waiter, _new_bill(s))
    await _save(api, waiter, bill, version=1, quantity=2)

    stale = await _save(api, waiter, bill, version=1, quantity=5)

    assert (stale.status_code, stale.json()["code"]) == (409, "BILL_VERSION_CONFLICT")


async def test_an_expired_lease_is_taken_and_the_late_device_loses_its_save(
    api: AsyncClient, system_engine: AsyncEngine
) -> None:
    """The waiter went offline holding the bill; the cashier took it over after the lease ran out
    (ADR-031 rule 4). The waiter's offline edit is refused when it comes back."""
    s, waiter = await _table_service(api)
    bill = await _open(api, waiter, _new_bill(s))
    await _expire_leases(system_engine)

    assert (await _lease(api, s.device_token, bill["id"], s.ids["owner"])).status_code == 200
    assert (await _save(api, s.device_token, bill, version=1, quantity=4)).status_code == 200
    late = await _save(api, waiter, bill, version=1, quantity=2)

    assert (late.status_code, late.json()["code"]) == (409, "BILL_VERSION_CONFLICT")


async def test_two_saves_of_the_same_version_at_once_let_exactly_one_win(
    api: AsyncClient,
) -> None:
    s, waiter = await _table_service(api)
    bill = await _open(api, waiter, _new_bill(s))

    results = await asyncio.gather(*(_save(api, waiter, bill, 1, q) for q in (2, 3)))

    assert sorted(r.status_code for r in results) == [200, 409]
    assert (await _bills(api, s.device_token))[0]["version"] == 2


async def test_a_bill_moves_to_a_free_table_on_save(api: AsyncClient) -> None:
    s, waiter = await _table_service(api)
    table = await post(api, s.owner_token, f"/outlets/{s.outlet_id}/tables", {"label": "B1"})
    bill = await _open(api, waiter, _new_bill(s))

    moved = await _save(api, waiter, {**bill, "table_id": table["id"], "table_label": "B1"}, 1, 1)

    assert moved.status_code == 200, moved.text
    assert (moved.json()["data"]["table_id"], moved.json()["data"]["table_label"]) == (
        table["id"],
        "B1",
    )


async def test_a_cancelled_bill_leaves_the_list(api: AsyncClient) -> None:
    s, waiter = await _table_service(api)
    bill = await _open(api, waiter, _new_bill(s))

    cancelled = await api.delete(
        f"/api/v1/open-bills/{bill['id']}?version=1", headers=bearer(waiter)
    )

    assert cancelled.status_code == 200, cancelled.text
    assert await _bills(api, s.device_token) == []


async def test_paying_the_bill_closes_it(api: AsyncClient) -> None:
    s, waiter = await _table_service(api)
    bill = await _open(api, waiter, _new_bill(s))
    opened, _, placed, _ = batch(s)
    paid = copy.deepcopy(placed)
    paid["payload"]["closes_bill_id"] = bill["id"]

    results = (await push(api, s.device_token, [opened, paid])).json()["data"]["results"]

    assert [r["status"] for r in results] == ["accepted", "accepted"]
    assert await _bills(api, waiter) == []
    closed = await _lease(api, waiter, bill["id"], s.ids["siti"])
    assert (closed.status_code, closed.json()["code"]) == (404, "BILL_NOT_FOUND")


async def test_an_outlet_with_open_bills_cannot_go_back_to_counter(api: AsyncClient) -> None:
    s, waiter = await _table_service(api)
    await _open(api, waiter, _new_bill(s))

    refused = await _set_mode(api, s, "counter")

    assert (refused.status_code, refused.json()["code"]) == (409, "OPEN_BILLS_EXIST")


async def test_another_tenant_never_sees_the_bill(api: AsyncClient) -> None:
    s, waiter = await _table_service(api)
    bill = await _open(api, waiter, _new_bill(s))
    other = await outlet_with_menu_and_device(api, email="lain@resto.id", slug="resto-lain")
    await _set_mode(api, other, "table_service")

    assert await _bills(api, other.device_token) == []
    stolen = await _lease(api, other.device_token, bill["id"], other.ids["siti"])
    assert (stolen.status_code, stolen.json()["code"]) == (404, "BILL_NOT_FOUND")


async def test_a_back_office_token_cannot_use_the_device_endpoints(api: AsyncClient) -> None:
    s, _ = await _table_service(api)

    response = await api.get("/api/v1/open-bills", headers=bearer(s.owner_token))

    assert response.status_code == 403
