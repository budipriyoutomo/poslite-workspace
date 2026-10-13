"""ADR-024: a manager imports a device's emergency export; its events go through the same push
path on behalf of that device — so importing the same file twice changes nothing."""

from typing import Any

from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncEngine

from poslite.sync.domain.device_export import canonical_checksum

from ..identity.helpers import bearer
from ..organization.brands import as_user, company_with_two_brands
from .helpers import Setup, outlet_with_menu_and_device
from .test_push import batch


async def export_of(api: AsyncClient, s: Setup, events: list[dict[str, Any]]) -> dict[str, Any]:
    tenant = (await api.get("/api/v1/me/access", headers=bearer(s.owner_token))).json()["data"]
    return {
        "format": "poslite-device-export",
        "version": 1,
        "exported_at": "2026-09-25T09:12:00.000Z",
        "app_version": "0.1.0",
        "tenant_id": tenant["tenant"]["id"],
        "outlet_id": s.outlet_id,
        "device_id": s.device_id,
        "device_code": "A",
        "events": events,
        "checksum": canonical_checksum(events),  # type: ignore[arg-type]
    }


async def upload(api: AsyncClient, token: str, file: dict[str, Any]) -> Response:
    return await api.post("/api/v1/imports/device-export", json=file, headers=bearer(token))


async def test_imports_a_file_once_and_a_second_time_as_duplicates(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    file = await export_of(api, s, batch(s))

    first = await upload(api, s.owner_token, file)
    again = await upload(api, s.owner_token, file)
    history = await api.get(
        "/api/v1/imports", params={"device_id": s.device_id}, headers=bearer(s.owner_token)
    )

    assert first.status_code == 201, first.text
    assert {k: first.json()["data"][k] for k in ("accepted", "duplicate", "flagged")} == {
        "accepted": 4,
        "duplicate": 0,
        "flagged": 0,
    }
    assert again.json()["data"]["duplicate"] == 4
    assert [h["accepted"] for h in history.json()["data"]] == [0, 4]  # newest first


async def test_a_revoked_device_can_still_be_imported(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    await api.delete(f"/api/v1/devices/{s.device_id}", headers=bearer(s.owner_token))

    response = await upload(api, s.owner_token, await export_of(api, s, batch(s)))

    assert response.json()["data"]["accepted"] == 4


async def test_rejected_events_are_listed_with_their_code(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    opened, moved, _placed, _closed = batch(s)
    stray = {**moved, "payload": {**moved["payload"], "amount": 0}}

    response = await upload(api, s.owner_token, await export_of(api, s, [opened, stray]))

    assert response.json()["data"]["rejected"] == [{"id": stray["id"], "code": "SCHEMA_INVALID"}]


async def test_a_damaged_file_or_one_of_another_company_is_refused(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    other = await outlet_with_menu_and_device(api, email="lain@resto.id", slug="resto-lain")
    file = await export_of(api, s, batch(s))

    damaged = await upload(api, s.owner_token, {**file, "checksum": "0" * 64})
    foreign = await upload(api, other.owner_token, file)
    unknown = await upload(api, s.owner_token, {**file, "device_id": "01K5ZD000000000000000ZZZZZ"})

    assert (damaged.status_code, damaged.json()["code"]) == (422, "EXPORT_CHECKSUM_MISMATCH")
    assert (foreign.status_code, foreign.json()["code"]) == (422, "EXPORT_WRONG_TENANT")
    assert (unknown.status_code, unknown.json()["code"]) == (422, "EXPORT_DEVICE_UNKNOWN")


async def test_only_managers_of_the_outlet_import(
    api: AsyncClient, app_engine: AsyncEngine
) -> None:
    company = await company_with_two_brands(api, app_engine)
    tenant = (await api.get("/api/v1/me/access", headers=as_user(company.owner))).json()["data"]
    file = {
        "format": "poslite-device-export",
        "version": 1,
        "tenant_id": tenant["tenant"]["id"],
        "outlet_id": company.outlet_a1,
        "device_id": "01K5ZD000000000000000ZZZZZ",
        "events": [],
        "checksum": canonical_checksum([]),
    }

    response = await upload(api, company.brand_b_manager, file)

    assert (response.status_code, response.json()["code"]) == (403, "OUTLET_FORBIDDEN")
