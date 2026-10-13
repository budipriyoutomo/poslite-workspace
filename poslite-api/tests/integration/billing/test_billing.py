from datetime import datetime, timedelta
from typing import Any

from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from e2e.identity.helpers import bearer, signup
from poslite.billing.api import run_billing
from poslite.shared.infrastructure.fake_gateway import FakeGateway

PRICE = 150_000
gateway = FakeGateway(secret="dev-gateway-secret", public_url="http://localhost:8000")  # noqa: S106


async def run(system_engine: AsyncEngine, now: datetime) -> Any:
    return await run_billing(
        system=async_sessionmaker(system_engine), gateway=gateway, now=now, price_per_outlet=PRICE
    )


async def signed_up_at(system_engine: AsyncEngine) -> datetime:
    async with system_engine.begin() as conn:
        value: datetime = (await conn.execute(text("SELECT created_at FROM tenants"))).scalar_one()
    return value


async def subscription(api: AsyncClient, token: str) -> dict[str, Any]:
    response = await api.get("/api/v1/billing/subscription", headers=bearer(token))
    assert response.status_code == 200, response.text
    data: dict[str, Any] = response.json()["data"]
    return data


async def pay(api: AsyncClient, gateway_ref: str, at: datetime) -> Any:
    body, headers = gateway.notification(gateway_ref, "paid", at)
    return await api.post("/api/v1/gateway/webhook", content=body, headers=headers)


async def test_a_new_tenant_starts_a_14_day_trial(
    api: AsyncClient, system_engine: AsyncEngine
) -> None:
    token = (await signup(api))["token"]
    start = await signed_up_at(system_engine)

    await run(system_engine, start + timedelta(hours=1))

    sub = await subscription(api, token)
    assert sub["status"] == "trialing"
    assert datetime.fromisoformat(sub["trial_ends_at"]) == start + timedelta(days=14)
    assert sub["invoices"] == []


async def test_after_the_trial_an_invoice_for_the_active_outlets_is_issued_once(
    api: AsyncClient, system_engine: AsyncEngine
) -> None:
    owner = await signup(api)
    token = owner["token"]
    await api.post(
        "/api/v1/outlets",
        json={"brand_id": owner["brand_id"], "code": "BDG01", "name": "Dago"},
        headers=bearer(token),
    )
    start = await signed_up_at(system_engine)
    later = start + timedelta(days=15)

    stats = await run(system_engine, later)
    await run(system_engine, later + timedelta(hours=1))

    assert stats.issued == 1
    [invoice] = (await subscription(api, token))["invoices"]
    assert invoice["outlet_count"] == 2
    assert invoice["amount"] == 2 * PRICE
    assert invoice["status"] == "open"
    assert invoice["period_start"] == (start + timedelta(days=14)).date().isoformat()
    assert invoice["payment_url"].endswith(f"/gateway/fake/pay/fake_{invoice['id']}")


async def test_an_unpaid_invoice_suspends_the_tenant_after_the_grace_days(
    api: AsyncClient, system_engine: AsyncEngine
) -> None:
    token = (await signup(api))["token"]
    start = await signed_up_at(system_engine)
    await run(system_engine, start + timedelta(days=15))

    stats = await run(system_engine, start + timedelta(days=14 + 7, hours=1))

    assert stats.suspended == 1
    blocked = await api.post("/api/v1/categories", json={"name": "X"}, headers=bearer(token))
    assert blocked.json()["code"] == "TENANT_SUSPENDED"
    assert (await subscription(api, token))["status"] == "past_due"


async def test_paying_reactivates_the_tenant_and_starts_the_period(
    api: AsyncClient, system_engine: AsyncEngine
) -> None:
    token = (await signup(api))["token"]
    start = await signed_up_at(system_engine)
    await run(system_engine, start + timedelta(days=15))
    await run(system_engine, start + timedelta(days=22))
    [invoice] = (await subscription(api, token))["invoices"]

    response = await pay(api, f"fake_{invoice['id']}", start + timedelta(days=23))
    again = await pay(api, f"fake_{invoice['id']}", start + timedelta(days=23))

    assert (response.status_code, again.status_code) == (200, 200)
    sub = await subscription(api, token)
    assert sub["status"] == "active"
    assert sub["current_period_end"] == invoice["period_end"]
    assert sub["invoices"][0]["status"] == "paid"
    created = await api.post("/api/v1/categories", json={"name": "Y"}, headers=bearer(token))
    assert created.status_code == 201


async def test_payment_does_not_lift_an_operator_suspension(
    api: AsyncClient, system_engine: AsyncEngine
) -> None:
    token = (await signup(api))["token"]
    start = await signed_up_at(system_engine)
    await run(system_engine, start + timedelta(days=15))
    async with system_engine.begin() as conn:
        await conn.execute(
            text("UPDATE tenants SET status = 'suspended', suspended_reason = 'manual'")
        )
    [invoice] = (await subscription(api, token))["invoices"]

    await pay(api, f"fake_{invoice['id']}", start + timedelta(days=16))

    blocked = await api.post("/api/v1/categories", json={"name": "Z"}, headers=bearer(token))
    assert blocked.json()["code"] == "TENANT_SUSPENDED"


async def test_rejects_a_forged_notification(api: AsyncClient) -> None:
    response = await api.post(
        "/api/v1/gateway/webhook",
        content=b'{"gateway_ref":"fake_X","status":"paid","occurred_at":"2026-09-27T03:00:00+00:00"}',
        headers={"X-Fake-Signature": "nope"},
    )

    assert response.status_code == 401


async def test_the_fake_checkout_pays_an_invoice(
    api: AsyncClient, system_engine: AsyncEngine
) -> None:
    token = (await signup(api))["token"]
    start = await signed_up_at(system_engine)
    await run(system_engine, start + timedelta(days=15))
    [invoice] = (await subscription(api, token))["invoices"]

    page = await api.get(f"/api/v1/gateway/fake/pay/fake_{invoice['id']}")
    paid = await api.post(f"/api/v1/gateway/fake/pay/fake_{invoice['id']}")

    assert page.status_code == 200
    assert "Bayar" in page.text
    assert paid.status_code == 200
    assert (await subscription(api, token))["invoices"][0]["status"] == "paid"
